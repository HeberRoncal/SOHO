import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  Prisma,
  type OperacionRecepcionCompra,
} from '../../generated/prisma/client.js';
import type { IdentidadPedido } from '../../pedidos/seguridad/sesion-pedido.guard.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import { ConfiguracionPedidos } from '../../pedidos/configuracion-pedidos.js';
import {
  ComprobantesPrivadosService,
  type ArchivoPreparado,
} from '../../pedidos/archivos/comprobantes-privados.service.js';
import { DatosInstruccionPago } from '../dto/datos-instruccion-pago.js';
import { RecepcionesCompraService } from './recepciones-compra.service.js';
import { DatosCorreccionRecepcion } from './datos-correccion-recepcion.js';
import { RespuestaAtencionRecepcion as Respuesta } from './respuesta-atencion-recepcion.js';
import { RespuestaRecepcionCompra } from './respuesta-recepcion-compra.js';
import { RespuestaProcesamientoRecepcion } from './respuesta-procesamiento-recepcion.js';
import {
  INCLUIR_RECEPCION,
  type RecepcionCompra,
} from './recepcion-compra.interface.js';

type Datos = ReturnType<typeof DatosCorreccionRecepcion.leer>;
@Injectable()
export class CorreccionesRecepcionService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
    @Inject(RecepcionesCompraService)
    private readonly recepciones: RecepcionesCompraService,
    @Inject(ComprobantesPrivadosService)
    private readonly archivos: ComprobantesPrivadosService,
    @Inject(ConfiguracionPedidos) private readonly config: ConfiguracionPedidos,
  ) {}
  private async bloquear(
    tx: Prisma.TransactionClient,
    id: string,
    i: IdentidadPedido,
  ) {
    const r = await this.recepciones.bloquear(tx, id);
    await this.recepciones.autorizar(tx, r, i);
    RespuestaRecepcionCompra.inicial(r, this.config.accesoInvitadoMs);
    return r;
  }
  private hash(id: string, d: Datos, originalHash: string, i: IdentidadPedido) {
    return DatosInstruccionPago.huella({
      versionContrato: 1,
      accion: 'ADJUNTAR_COMPROBANTE',
      recepcionId: id,
      claveSolicitud: d.claveSolicitud,
      versionEsperada: d.versionEsperada,
      comprobante: {
        nombreArchivo: d.comprobante.nombreArchivo,
        tipoArchivo: d.comprobante.tipoArchivo,
        numeroOperacion: d.comprobante.numeroOperacion ?? null,
        sha256Original: originalHash,
      },
      usuarioId: i.sesion?.usuario.id ?? null,
      accesoInvitadoHash: i.sesion ? null : i.accesoInvitadoHash,
    });
  }
  private async reservar(
    id: string,
    d: Datos,
    originalHash: string,
    hash: string,
    i: IdentidadPedido,
    p?: ArchivoPreparado,
  ) {
    return this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, i),
        o = await tx.operacionRecepcionCompra.findUnique({
          where: { claveSolicitud: d.claveSolicitud },
        });
      if (o) {
        if (
          o.recepcionId !== id ||
          o.accion !== 'ADJUNTAR_COMPROBANTE' ||
          o.solicitudHash !== hash
        )
          throw new ConflictException(
            'La clave corresponde a otra corrección.',
          );
        return { r, o, nueva: false };
      }
      if (
        r.estado !== 'REQUIERE_ATENCION' ||
        r.version !== d.versionEsperada ||
        !(r.motivos as string[]).includes('COMPROBANTE_REQUIERE_CORRECCION')
      )
        throw new ConflictException(
          'No hay una corrección autorizada para esta versión de recepción.',
        );
      const solicitud = await tx.operacionRecepcionCompra.findFirst({
        where: {
          recepcionId: id,
          accion: 'SOLICITAR_CORRECCION',
          estado: 'CONFIRMADA',
          comprobanteId: r.comprobanteActualId!,
        },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      });
      if (!solicitud)
        throw new ConflictException(
          'La solicitud de corrección requiere revisión.',
        );
      if (
        (d.comprobante.numeroOperacion ?? null) !==
        r.comprobantes.find((c) => c.id === r.comprobanteActualId)!
          .numeroOperacion
      )
        throw new ConflictException(
          'La corrección debe conservar el número informado de la misma transferencia.',
        );
      if (
        await tx.operacionRecepcionCompra.count({
          where: { recepcionId: id, estado: 'PENDIENTE' },
        })
      )
        throw new ConflictException(
          'Recupera la operación pendiente con su clave original.',
        );
      if (!p) return null;
      const a = this.archivos.reservar(p),
        ahora = new Date();
      const c = await tx.comprobanteRecepcionCompra.create({
        data: {
          recepcionId: id,
          version: r.comprobantes.at(-1)!.version + 1,
          claveSolicitud: d.claveSolicitud,
          solicitudHash: hash,
          archivoClave: a.clave,
          archivoSha256Original: originalHash,
          archivoSha256: a.sha256,
          nombreArchivo: d.comprobante.nombreArchivo,
          formato: a.formato,
          tamanoBytes: a.tamanoBytes,
          numeroOperacion: d.comprobante.numeroOperacion ?? null,
          creadoEn: ahora,
        },
      });
      const nueva = await tx.operacionRecepcionCompra.create({
        data: {
          recepcionId: id,
          comprobanteId: c.id,
          claveSolicitud: d.claveSolicitud,
          solicitudHash: hash,
          accion: 'ADJUNTAR_COMPROBANTE',
          actor: i.sesion?.usuario.rol ?? 'SISTEMA',
          responsableId: i.sesion?.usuario.id ?? null,
          versionEsperada: d.versionEsperada,
          antes: RespuestaProcesamientoRecepcion.estado(
            r,
          ) as Prisma.InputJsonValue,
          creadoEn: ahora,
        },
      });
      return { r, o: nueva, nueva: true };
    });
  }
  async adjuntar(id: string, cuerpo: unknown, i: IdentidadPedido) {
    id = DatosInstruccionPago.uuid(id);
    const d = DatosCorreccionRecepcion.leer(cuerpo),
      original = this.archivos.decodificar(d.comprobante.contenidoBase64),
      originalHash = createHash('sha256').update(original).digest('hex'),
      hash = this.hash(id, d, originalHash, i);
    let e = await this.reservar(id, d, originalHash, hash, i),
      preparado: ArchivoPreparado | undefined;
    if (!e) {
      preparado = await this.archivos.preparar(
        original,
        d.comprobante.tipoArchivo,
      );
      try {
        e = await this.reservar(id, d, originalHash, hash, i, preparado);
      } catch (error) {
        e = await this.reservar(id, d, originalHash, hash, i);
        if (!e) throw error;
      }
    }
    if (!e)
      throw new ServiceUnavailableException(
        'No se pudo reservar la corrección. Conserva su clave.',
      );
    return this.intentar(id, e.o.claveSolicitud, i, {
      original,
      preparado,
      nueva: e.nueva,
    });
  }
  private final(
    r: RecepcionCompra,
    o: OperacionRecepcionCompra,
    nueva = false,
  ) {
    return {
      codigoHttp: nueva ? 201 : 200,
      respuesta: Respuesta.leer(r, o, this.config.accesoInvitadoMs),
    };
  }
  private pendiente(r: RecepcionCompra, o: OperacionRecepcionCompra) {
    return {
      codigoHttp: 202,
      respuesta: {
        ...RespuestaRecepcionCompra.actual(r, this.config.accesoInvitadoMs),
        operacion: {
          claveSolicitud: o.claveSolicitud,
          estado: 'PENDIENTE' as const,
        },
        resultado: null,
      },
    };
  }
  private async intentar(
    id: string,
    clave: string,
    i: IdentidadPedido,
    entrada?: {
      original: Buffer;
      preparado?: ArchivoPreparado;
      nueva: boolean;
    },
  ) {
    const e = await this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, i),
        o = await tx.operacionRecepcionCompra.findUnique({
          where: { claveSolicitud: clave },
        });
      if (!o || o.recepcionId !== id || o.accion !== 'ADJUNTAR_COMPROBANTE')
        throw new NotFoundException('Operación no encontrada.');
      const c = r.comprobantes.find((c) => c.id === o.comprobanteId)!;
      const d: Datos = {
        claveSolicitud: clave,
        versionEsperada: o.versionEsperada,
        comprobante: {
          nombreArchivo: c.nombreArchivo,
          tipoArchivo: c.formato as Datos['comprobante']['tipoArchivo'],
          contenidoBase64: '',
          ...(c.numeroOperacion ? { numeroOperacion: c.numeroOperacion } : {}),
        },
      };
      if (o.solicitudHash !== this.hash(id, d, c.archivoSha256Original, i))
        throw new ConflictException(
          'La solicitud de corrección requiere revisión.',
        );
      if (o.estado !== 'PENDIENTE') return { r, o, c, token: null };
      if (r.version !== o.versionEsperada || r.estado !== 'REQUIERE_ATENCION')
        throw new ConflictException(
          'La recepción cambió durante la corrección.',
        );
      const ahora = new Date();
      if (
        (c.bloqueoEscrituraHasta && c.bloqueoEscrituraHasta > ahora) ||
        (!entrada && c.proximaRevisionEn && c.proximaRevisionEn > ahora)
      )
        return { r, o, c, token: null };
      const token = randomUUID(),
        hasta = new Date(ahora.getTime() + 60000);
      await tx.comprobanteRecepcionCompra.update({
        where: { id: c.id },
        data: {
          tokenEscritura: token,
          bloqueoEscrituraHasta: hasta,
          proximaRevisionEn: hasta,
          intentosEscritura: { increment: 1 },
        },
      });
      return { r, o, c, token };
    });
    if (e.o.estado !== 'PENDIENTE') return this.final(e.r, e.o);
    if (!e.token) return this.pendiente(e.r, e.o);
    const a = {
      clave: e.c.archivoClave,
      sha256: e.c.archivoSha256,
      formato: e.c.formato,
      tamanoBytes: e.c.tamanoBytes,
    };
    try {
      if (!(await this.archivos.comprobarReservado(a))) {
        if (!entrada) {
          await this.liberar(id, e.o.id, e.token, i);
          return this.pendiente(e.r, e.o);
        }
        const p =
          entrada.preparado ??
          (await this.archivos.preparar(
            entrada.original,
            e.c.formato as Datos['comprobante']['tipoArchivo'],
          ));
        await this.archivos.guardarReservado(a, p);
      }
      return await this.escritura.transaccion(async (tx) => {
        let r = await this.bloquear(tx, id, i);
        let o = await tx.operacionRecepcionCompra.findUniqueOrThrow({
          where: { id: e.o.id },
        });
        if (o.estado !== 'PENDIENTE') return this.final(r, o);
        const c = r.comprobantes.find((c) => c.id === o.comprobanteId)!;
        if (c.tokenEscritura !== e.token) return this.pendiente(r, o);
        if (r.version !== o.versionEsperada || r.estado !== 'REQUIERE_ATENCION')
          throw new ConflictException(
            'La recepción cambió durante la corrección.',
          );
        const motivos = (r.motivos as string[]).filter(
            (m) => m !== 'COMPROBANTE_REQUIERE_CORRECCION',
          ),
          ahora = new Date();
        await tx.comprobanteRecepcionCompra.update({
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
        r = await tx.recepcionCompra.update({
          where: { id },
          data: {
            comprobanteActualId: c.id,
            version: { increment: 1 },
            estado: motivos.length ? 'REQUIERE_ATENCION' : 'RECIBIDA',
            motivos,
          },
          include: INCLUIR_RECEPCION,
        });
        const respuesta = Respuesta.crear(r, o, this.config.accesoInvitadoMs);
        o = await tx.operacionRecepcionCompra.update({
          where: { id: o.id },
          data: {
            estado: 'CONFIRMADA',
            versionResultante: r.version,
            despues: RespuestaProcesamientoRecepcion.estado(
              r,
            ) as Prisma.InputJsonValue,
            respuesta: respuesta as Prisma.InputJsonValue,
            codigoHttp: 201,
            finalizadoEn: ahora,
          },
        });
        return this.final(r, o, entrada?.nueva);
      });
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException
      )
        throw error;
      const r = await this.liberar(id, e.o.id, e.token, i);
      if (r.o.estado !== 'PENDIENTE') return this.final(r.r, r.o);
      if (error instanceof HttpException && error.getStatus() < 500)
        throw error;
      return this.pendiente(r.r, r.o);
    }
  }
  private liberar(id: string, op: string, token: string, i: IdentidadPedido) {
    return this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, i),
        o = await tx.operacionRecepcionCompra.findUniqueOrThrow({
          where: { id: op },
        });
      if (o.estado === 'PENDIENTE')
        await tx.comprobanteRecepcionCompra.updateMany({
          where: {
            id: o.comprobanteId,
            tokenEscritura: token,
            estadoArchivo: 'PENDIENTE',
          },
          data: {
            tokenEscritura: null,
            bloqueoEscrituraHasta: null,
            proximaRevisionEn: new Date(Date.now() + 5000),
            ultimaIncidencia:
              'Corrección pendiente de verificar. Conservar la misma clave e imagen.',
          },
        });
      return { r, o };
    });
  }
  async recuperarSiExiste(id: string, clave: string, i: IdentidadPedido) {
    id = DatosInstruccionPago.uuid(id);
    clave = DatosInstruccionPago.uuid(clave);
    const existe = await this.escritura.transaccion(async (tx) => {
      await this.bloquear(tx, id, i);
      return tx.operacionRecepcionCompra.findFirst({
        where: {
          claveSolicitud: clave,
          recepcionId: id,
          accion: 'ADJUNTAR_COMPROBANTE',
        },
        select: { id: true },
      });
    });
    return existe ? this.intentar(id, clave, i) : null;
  }
}
