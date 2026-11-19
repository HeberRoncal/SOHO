import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import { ConfiguracionPedidos } from '../../pedidos/configuracion-pedidos.js';
import {
  ComprobantesPrivadosService,
  type ArchivoGuardado,
  type ArchivoPreparado,
} from '../../pedidos/archivos/comprobantes-privados.service.js';
import type { IdentidadPedido } from '../../pedidos/seguridad/sesion-pedido.guard.js';
import { InstruccionesPagoService } from '../instrucciones-pago.service.js';
import { DatosInstruccionPago } from '../dto/datos-instruccion-pago.js';
import { RespuestaInstruccionPago } from '../dto/respuesta-instruccion-pago.js';
import { DatosRecepcionCompra } from './datos-recepcion-compra.js';
import { RespuestaRecepcionCompra } from './respuesta-recepcion-compra.js';
import {
  INCLUIR_RECEPCION,
  type RecepcionCompra,
} from './recepcion-compra.interface.js';

type Datos = ReturnType<typeof DatosRecepcionCompra.leer>;
const REINICIAR = Symbol('Volver a bloquear por recepción');

@Injectable()
export class RecepcionesCompraService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
    @Inject(InstruccionesPagoService)
    private readonly instrucciones: InstruccionesPagoService,
    @Inject(ComprobantesPrivadosService)
    private readonly archivos: ComprobantesPrivadosService,
    @Inject(ConfiguracionPedidos) private readonly config: ConfiguracionPedidos,
  ) {}

  async bloquear(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM recepciones_compra WHERE id=${id} FOR UPDATE`;
    const r = await tx.recepcionCompra.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Recepción no encontrada.');
    await tx.$queryRaw`SELECT id FROM instrucciones_pago WHERE id=${r.instruccionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM comprobantes_recepcion_compra WHERE recepcion_id=${id} ORDER BY version FOR UPDATE`;
    return tx.recepcionCompra.findUniqueOrThrow({
      where: { id },
      include: INCLUIR_RECEPCION,
    });
  }

  async autorizar(
    tx: Prisma.TransactionClient,
    r: RecepcionCompra,
    identidad: IdentidadPedido,
  ) {
    if (
      r.instruccion.usuarioId === null &&
      r.accesoInvitadoExpiraEn?.getTime() !==
        r.creadoEn.getTime() + this.config.accesoInvitadoMs
    )
      throw new ServiceUnavailableException(
        'El acceso de la recepción requiere revisión.',
      );
    await this.instrucciones.autorizar(
      tx,
      r.instruccion,
      identidad,
      r.accesoInvitadoExpiraEn ?? undefined,
    );
  }

  private async recuperar(id: string, identidad: IdentidadPedido) {
    return this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id);
      await this.autorizar(tx, r, identidad);
      return r;
    });
  }

  private async asegurar(
    d: Datos,
    hash: string,
    originalHash: string,
    identidad: IdentidadPedido,
    preparado?: ArchivoPreparado,
  ): Promise<{ r: RecepcionCompra; nueva: boolean } | null> {
    for (let intento = 0; intento < 3; intento++) {
      try {
        return await this.escritura.transaccion(async (tx) => {
          let anterior = await tx.recepcionCompra.findUnique({
            where: { claveSolicitud: d.claveSolicitud },
            select: { id: true },
          });
          const i = await tx.instruccionPago.findUnique({
            where: { id: d.instruccionPagoId },
          });
          if (!anterior && i)
            anterior = await tx.recepcionCompra.findUnique({
              where: { claveCreacionPedido: i.claveCreacionPedido },
              select: { id: true },
            });
          if (anterior) {
            const r = await this.bloquear(tx, anterior.id);
            await this.autorizar(tx, r, identidad);
            if (
              r.instruccionId !== d.instruccionPagoId ||
              r.solicitudHash !== hash
            )
              throw new ConflictException({
                codigo: 'RECEPCION_EN_USO',
                message:
                  'La compra o clave ya tiene otra recepción. Conserva y recupera su referencia original.',
              });
            return { r, nueva: false };
          }
          if (!i) throw new NotFoundException('Instrucción no encontrada.');
          await tx.$queryRaw`SELECT id FROM instrucciones_pago WHERE id=${i.id} FOR UPDATE`;
          // Otra recepción pudo aparecer durante la espera: reiniciar respetando recepción -> instrucción.
          if (
            await tx.recepcionCompra.findUnique({
              where: { claveCreacionPedido: i.claveCreacionPedido },
              select: { id: true },
            })
          )
            throw REINICIAR;
          const vigente = await tx.instruccionPago.findUniqueOrThrow({
            where: { id: i.id },
          });
          await this.instrucciones.autorizar(tx, vigente, identidad);
          RespuestaInstruccionPago.leer(vigente, this.config.accesoInvitadoMs);
          if (
            vigente.pedidoId ||
            (await tx.pedido.findUnique({
              where: { claveCreacion: vigente.claveCreacionPedido },
              select: { id: true },
            }))
          )
            throw new ConflictException({
              codigo: 'COMPRA_YA_REGISTRADA',
              message:
                'Recupera el pedido de esta compra antes de adjuntar otro comprobante.',
            });
          if (!preparado) return null;
          const ahora = new Date(),
            reserva = this.archivos.reservar(preparado),
            id = randomUUID();
          await tx.recepcionCompra.create({
            data: {
              id,
              referencia: 'REC-' + randomBytes(8).toString('hex').toUpperCase(),
              instruccionId: vigente.id,
              claveCreacionPedido: vigente.claveCreacionPedido,
              claveSolicitud: d.claveSolicitud,
              solicitudHash: hash,
              motivos: [],
              creadoEn: ahora,
              accesoInvitadoExpiraEn:
                vigente.usuarioId === null
                  ? new Date(ahora.getTime() + this.config.accesoInvitadoMs)
                  : null,
            },
          });
          await tx.comprobanteRecepcionCompra.create({
            data: {
              recepcionId: id,
              version: 1,
              claveSolicitud: d.claveSolicitud,
              solicitudHash: hash,
              archivoClave: reserva.clave,
              archivoSha256Original: originalHash,
              archivoSha256: reserva.sha256,
              nombreArchivo: d.comprobante.nombreArchivo,
              formato: reserva.formato,
              tamanoBytes: reserva.tamanoBytes,
              numeroOperacion: d.comprobante.numeroOperacion ?? null,
              creadoEn: ahora,
              proximaRevisionEn: ahora,
            },
          });
          return {
            r: await tx.recepcionCompra.findUniqueOrThrow({
              where: { id },
              include: INCLUIR_RECEPCION,
            }),
            nueva: true,
          };
        });
      } catch (error) {
        if (
          (error === REINICIAR ||
            (error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002')) &&
          intento < 2
        )
          continue;
        throw error;
      }
    }
    throw new ServiceUnavailableException(
      'No se pudo recuperar la recepción. Conserva la misma solicitud.',
    );
  }

  async recibir(cuerpo: unknown, identidad: IdentidadPedido) {
    if (!identidad.sesion && !identidad.accesoInvitadoHash)
      throw new UnauthorizedException();
    const d = DatosRecepcionCompra.leer(cuerpo),
      original = this.archivos.decodificar(d.comprobante.contenidoBase64),
      originalHash = createHash('sha256').update(original).digest('hex'),
      hash = DatosInstruccionPago.huella({
        versionContrato: 1,
        accion: 'RECIBIR_COMPROBANTE',
        instruccionPagoId: d.instruccionPagoId,
        comprobante: {
          nombreArchivo: d.comprobante.nombreArchivo,
          tipoArchivo: d.comprobante.tipoArchivo,
          numeroOperacion: d.comprobante.numeroOperacion ?? null,
          sha256Original: originalHash,
        },
        usuarioId: identidad.sesion?.usuario.id ?? null,
        accesoInvitadoHash: identidad.sesion
          ? null
          : identidad.accesoInvitadoHash,
      });
    let resultado = await this.asegurar(d, hash, originalHash, identidad),
      preparado: ArchivoPreparado | undefined;
    if (!resultado) {
      preparado = await this.archivos.preparar(
        original,
        d.comprobante.tipoArchivo,
      );
      try {
        resultado = await this.asegurar(
          d,
          hash,
          originalHash,
          identidad,
          preparado,
        );
      } catch (error) {
        resultado = await this.asegurar(d, hash, originalHash, identidad);
        if (!resultado) throw error;
      }
    }
    if (!resultado)
      throw new ServiceUnavailableException(
        'No se pudo confirmar el intento de recepción.',
      );
    const r = await this.intentar(resultado.r.id, identidad, {
      original,
      preparado,
    });
    return {
      codigoHttp: r.estado === 'RECIBIENDO' ? 202 : resultado.nueva ? 201 : 200,
      respuesta:
        r.estado === 'RECIBIENDO'
          ? RespuestaRecepcionCompra.actual(r, this.config.accesoInvitadoMs)
          : RespuestaRecepcionCompra.inicial(r, this.config.accesoInvitadoMs),
    };
  }

  private descriptor(
    c: RecepcionCompra['comprobantes'][number],
  ): ArchivoGuardado {
    return {
      clave: c.archivoClave,
      sha256: c.archivoSha256,
      formato: c.formato,
      tamanoBytes: c.tamanoBytes,
    };
  }

  private async intentar(
    id: string,
    identidad: IdentidadPedido,
    entrada?: { original: Buffer; preparado?: ArchivoPreparado },
  ) {
    const tomada = await this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id);
      await this.autorizar(tx, r, identidad);
      if (r.estado !== 'RECIBIENDO') return { r, token: null };
      if (
        r.version !== 1 ||
        r.comprobantes.length !== 1 ||
        r.comprobantes[0].estadoArchivo !== 'PENDIENTE'
      )
        throw new ServiceUnavailableException(
          'El intento de recepción requiere revisión.',
        );
      const c = r.comprobantes[0],
        ahora = new Date();
      if (
        (c.bloqueoEscrituraHasta && c.bloqueoEscrituraHasta > ahora) ||
        (!entrada && c.proximaRevisionEn && c.proximaRevisionEn > ahora)
      )
        return { r, token: null };
      const token = randomUUID(),
        hasta = new Date(ahora.getTime() + 60_000);
      await tx.comprobanteRecepcionCompra.update({
        where: { id: c.id },
        data: {
          tokenEscritura: token,
          bloqueoEscrituraHasta: hasta,
          proximaRevisionEn: hasta,
          intentosEscritura: { increment: 1 },
        },
      });
      return { r, token };
    });
    if (!tomada.token) return tomada.r;
    const c = tomada.r.comprobantes[0],
      reserva = this.descriptor(c);
    try {
      if (!(await this.archivos.comprobarReservado(reserva))) {
        if (!entrada) return this.pendiente(id, tomada.token, identidad);
        const preparado =
          entrada.preparado ??
          (await this.archivos.preparar(
            entrada.original,
            c.formato as Datos['comprobante']['tipoArchivo'],
          ));
        await this.archivos.guardarReservado(reserva, preparado);
      }
      return await this.escritura.transaccion(async (tx) => {
        const r = await this.bloquear(tx, id);
        await this.autorizar(tx, r, identidad);
        if (
          r.estado !== 'RECIBIENDO' ||
          r.comprobantes[0].tokenEscritura !== tomada.token
        )
          return r;
        const ahora = new Date(),
          confirmado = await tx.comprobanteRecepcionCompra.update({
            where: { id: c.id },
            data: {
              estadoArchivo: 'DISPONIBLE',
              confirmadoEn: ahora,
              tokenEscritura: null,
              bloqueoEscrituraHasta: null,
              proximaRevisionEn: null,
              ultimaIncidencia: null,
            },
          });
        const respuesta = RespuestaRecepcionCompra.actual(
          {
            ...r,
            estado: 'RECIBIDA',
            version: 2,
            recibidaEn: ahora,
            comprobanteActualId: c.id,
            comprobantes: [confirmado],
          },
          this.config.accesoInvitadoMs,
        );
        return tx.recepcionCompra.update({
          where: { id },
          data: {
            estado: 'RECIBIDA',
            version: 2,
            recibidaEn: ahora,
            comprobanteActualId: c.id,
            respuesta: respuesta as Prisma.InputJsonValue,
          },
          include: INCLUIR_RECEPCION,
        });
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // No se borra evidencia: una confirmación de COMMIT puede haber quedado sin respuesta.
      return this.pendiente(id, tomada.token, identidad);
    }
  }

  private async pendiente(
    id: string,
    token: string,
    identidad: IdentidadPedido,
  ) {
    return this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id);
      await this.autorizar(tx, r, identidad);
      const c = r.comprobantes[0];
      if (r.estado === 'RECIBIENDO' && c.tokenEscritura === token)
        await tx.comprobanteRecepcionCompra.update({
          where: { id: c.id },
          data: {
            tokenEscritura: null,
            bloqueoEscrituraHasta: null,
            proximaRevisionEn: new Date(Date.now() + 5_000),
            ultimaIncidencia:
              'Archivo privado pendiente de verificación. Conservar la misma solicitud y evidencia.',
          },
        });
      return r;
    });
  }

  async porClave(clave: string, identidad: IdentidadPedido) {
    const id = await this.escritura.transaccion(async (tx) => {
      const r = await tx.recepcionCompra.findUnique({
        where: { claveSolicitud: DatosInstruccionPago.uuid(clave) },
        select: { id: true },
      });
      if (!r) throw new NotFoundException('Recepción no encontrada.');
      return r.id;
    });
    return this.porId(id, identidad);
  }

  async porId(id: string, identidad: IdentidadPedido) {
    const r = await this.intentar(DatosInstruccionPago.uuid(id), identidad);
    if (r.estado !== 'RECIBIENDO')
      RespuestaRecepcionCompra.inicial(r, this.config.accesoInvitadoMs);
    const respuesta = RespuestaRecepcionCompra.actual(
      r,
      this.config.accesoInvitadoMs,
    );
    const solicitud = await this.escritura.transaccion(async (tx) => {
      await this.autorizar(tx, r, identidad);
      return tx.operacionRecepcionCompra.findFirst({
        where: {
          recepcionId: r.id,
          accion: 'SOLICITAR_CORRECCION',
          estado: 'CONFIRMADA',
        },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        select: { id: true, mensaje: true, comprobanteId: true },
      });
    });
    return solicitud
      ? {
          ...respuesta,
          correccion: {
            solicitudId: solicitud.id,
            mensaje: solicitud.mensaje,
            pendiente:
              solicitud.comprobanteId === r.comprobanteActualId &&
              (r.motivos as string[]).includes(
                'COMPROBANTE_REQUIERE_CORRECCION',
              ),
            versionEsperada: r.version,
          },
        }
      : respuesta;
  }

  async comprobante(
    id: string,
    comprobanteId: string,
    identidad: IdentidadPedido,
  ) {
    id = DatosInstruccionPago.uuid(id);
    comprobanteId = DatosInstruccionPago.uuid(comprobanteId);
    const r = await this.recuperar(id, identidad),
      c = r.comprobantes.find((c) => c.id === comprobanteId);
    if (!c || c.estadoArchivo !== 'DISPONIBLE')
      throw new NotFoundException('Comprobante no encontrado.');
    const imagen = await this.archivos.leerOptimizado(
      c.archivoClave,
      c.archivoSha256,
      c.formato,
      c.tamanoBytes,
    );
    await this.recuperar(id, identidad);
    return imagen;
  }
}
