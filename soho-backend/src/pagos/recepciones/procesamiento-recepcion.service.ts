import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type OperacionRecepcionCompra,
} from '../../generated/prisma/client.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import type { IdentidadPedido } from '../../pedidos/seguridad/sesion-pedido.guard.js';
import { ConfiguracionPedidos } from '../../pedidos/configuracion-pedidos.js';
import {
  ComprobantesPrivadosService,
  type ArchivoGuardado,
} from '../../pedidos/archivos/comprobantes-privados.service.js';
import { PreparacionPedidoService } from '../../pedidos/preparacion/preparacion-pedido.service.js';
import { RegistroPedidoService } from '../../pedidos/preparacion/registro-pedido.service.js';
import { InventarioReservadoService } from '../../inventario/reservas/inventario-reservado.service.js';
import { DatosInstruccionPago } from '../dto/datos-instruccion-pago.js';
import { RespuestaInstruccionPago } from '../dto/respuesta-instruccion-pago.js';
import { RecepcionesCompraService } from './recepciones-compra.service.js';
import { DatosProcesamientoRecepcion } from './datos-procesamiento-recepcion.js';
import { RespuestaProcesamientoRecepcion as Respuesta } from './respuesta-procesamiento-recepcion.js';
import {
  INCLUIR_RECEPCION,
  type RecepcionCompra,
} from './recepcion-compra.interface.js';
import { RespuestaRecepcionCompra } from './respuesta-recepcion-compra.js';

const COMERCIALES = [
  'PRECIO_CAMBIADO',
  'STOCK_INSUFICIENTE',
  'ARTICULO_NO_DISPONIBLE',
  'COBERTURA_DESHABILITADA',
  'COBERTURA_TARIFA_PENDIENTE',
  'COTIZACION_CAMBIADA',
  'TOTAL_CAMBIADO',
  'INVENTARIO_INCONSISTENTE',
  'PREPARACION_INCONSISTENTE',
];
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { DatosAtencionRecepcion } from './datos-atencion-recepcion.js';
type Administracion = {
  sesion: ContextoAuth;
  datos: ReturnType<typeof DatosAtencionRecepcion.accion>;
};
type Datos = ReturnType<typeof DatosProcesamientoRecepcion.leer>;

@Injectable()
export class ProcesamientoRecepcionService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
    @Inject(RecepcionesCompraService)
    private readonly recepciones: RecepcionesCompraService,
    @Inject(ComprobantesPrivadosService)
    private readonly archivos: ComprobantesPrivadosService,
    @Inject(ConfiguracionPedidos) private readonly config: ConfiguracionPedidos,
    @Inject(PreparacionPedidoService)
    private readonly preparacion: PreparacionPedidoService,
    @Inject(RegistroPedidoService)
    private readonly registro: RegistroPedidoService,
    @Inject(InventarioReservadoService)
    private readonly inventario: InventarioReservadoService,
  ) {}
  private async bloquear(
    tx: Prisma.TransactionClient,
    id: string,
    identidad: IdentidadPedido,
    admin?: Administracion,
  ) {
    const r = await this.recepciones.bloquear(tx, id);
    if (admin) await this.escritura.comprobarSesion(tx, admin.sesion, true);
    else await this.recepciones.autorizar(tx, r, identidad);
    if (r.estado !== 'RECIBIENDO')
      RespuestaRecepcionCompra.inicial(r, this.config.accesoInvitadoMs);
    return r;
  }
  private hash(
    id: string,
    d: Datos,
    identidad: IdentidadPedido,
    admin?: Administracion,
  ) {
    if (admin)
      return DatosInstruccionPago.huella({
        versionContrato: 1,
        accion: 'REGISTRAR_PEDIDO',
        recepcionId: id,
        ...admin.datos,
        responsableId: admin.sesion.usuario.id,
      });
    return DatosInstruccionPago.huella({
      versionContrato: 1,
      accion: 'PROCESAR',
      recepcionId: id,
      ...d,
      usuarioId: identidad.sesion?.usuario.id ?? null,
      accesoInvitadoHash: identidad.sesion
        ? null
        : identidad.accesoInvitadoHash,
    });
  }
  private final(o: OperacionRecepcionCompra, r: RecepcionCompra) {
    return {
      codigoHttp: 200,
      respuesta: Respuesta.leer(o, r, this.config.accesoInvitadoMs),
    };
  }
  private incompleta(r: RecepcionCompra, clave: string) {
    return {
      codigoHttp: 202,
      respuesta: Respuesta.pendiente(r, clave, this.config.accesoInvitadoMs),
    };
  }
  private copia(o: OperacionRecepcionCompra): ArchivoGuardado {
    if (
      !o.archivoPedidoClave ||
      !o.archivoPedidoSha256 ||
      !o.archivoPedidoFormato ||
      !o.archivoPedidoBytes
    )
      throw new ServiceUnavailableException(
        'La copia reservada requiere revisión.',
      );
    return {
      clave: o.archivoPedidoClave,
      sha256: o.archivoPedidoSha256,
      formato: o.archivoPedidoFormato,
      tamanoBytes: o.archivoPedidoBytes,
    };
  }
  private async iniciar(
    id: string,
    d: Datos,
    identidad: IdentidadPedido,
    hash: string,
    admin?: Administracion,
  ) {
    return this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, identidad, admin);
      let o = await tx.operacionRecepcionCompra.findUnique({
        where: { claveSolicitud: d.claveSolicitud },
      });
      if (o) {
        if (
          o.recepcionId !== id ||
          o.accion !== (admin ? 'REGISTRAR_PEDIDO' : 'PROCESAR') ||
          o.solicitudHash !== hash
        )
          throw new ConflictException('La clave corresponde a otra operación.');
        if (o.estado !== 'PENDIENTE') return { r, o, token: null };
      } else {
        if (!admin && r.estado === 'PEDIDO_CREADO') {
          const anterior = await tx.operacionRecepcionCompra.findFirst({
            where: {
              recepcionId: id,
              accion: { in: ['PROCESAR', 'REGISTRAR_PEDIDO'] },
              estado: 'CONFIRMADA',
              despues: { path: '$.estado', equals: 'PEDIDO_CREADO' },
            },
            orderBy: { creadoEn: 'asc' },
          });
          if (!anterior)
            throw new ServiceUnavailableException(
              'El pedido registrado requiere revisión.',
            );
          return { r, o: anterior, token: null };
        }
        if (r.estado !== (admin ? 'REQUIERE_ATENCION' : 'RECIBIDA'))
          throw new ConflictException({
            codigo: 'RECEPCION_REQUIERE_ATENCION',
            message:
              'Esta recepción no admite procesamiento. Conserva su referencia para atención.',
          });
        if (
          admin &&
          (admin.datos.comprobanteActualId !== r.comprobanteActualId ||
            (r.motivos as string[]).includes('COMPROBANTE_REQUIERE_CORRECCION'))
        )
          throw new ConflictException(
            'Resuelve la corrección o consulta el comprobante actual antes de registrar.',
          );
        if (r.version !== d.versionEsperada)
          throw new ConflictException({
            codigo: 'RECEPCION_CAMBIADA',
            message: 'La recepción cambió. Consulta su estado.',
          });
        if (
          await tx.operacionRecepcionCompra.findFirst({
            where: { recepcionId: id, estado: 'PENDIENTE' },
            select: { id: true },
          })
        )
          throw new ConflictException({
            codigo: 'PROCESAMIENTO_EN_CURSO',
            message:
              'Recupera la operación pendiente usando su clave original.',
          });
        const c = r.comprobantes.find((c) => c.id === r.comprobanteActualId)!;
        const copia = this.archivos.reservarCopia({
          clave: c.archivoClave,
          sha256: c.archivoSha256,
          formato: c.formato,
          tamanoBytes: c.tamanoBytes,
        });
        const ahora = new Date();
        o = await tx.operacionRecepcionCompra.create({
          data: {
            recepcionId: id,
            comprobanteId: c.id,
            claveSolicitud: d.claveSolicitud,
            solicitudHash: hash,
            accion: admin ? 'REGISTRAR_PEDIDO' : 'PROCESAR',
            motivo: admin?.datos.motivo ?? null,
            actor: identidad.sesion?.usuario.rol ?? 'SISTEMA',
            responsableId: identidad.sesion?.usuario.id ?? null,
            versionEsperada: d.versionEsperada,
            antes: Respuesta.estado(r) as Prisma.InputJsonValue,
            archivoPedidoClave: copia.clave,
            archivoPedidoSha256: copia.sha256,
            archivoPedidoFormato: copia.formato,
            archivoPedidoBytes: copia.tamanoBytes,
            archivoPedidoEstado: 'PENDIENTE',
            creadoEn: ahora,
          },
        });
      }
      if (
        r.estado !== (admin ? 'REQUIERE_ATENCION' : 'RECIBIDA') ||
        r.version !== o.versionEsperada ||
        r.comprobanteActualId !== o.comprobanteId
      )
        throw new ConflictException(
          'La recepción cambió durante el procesamiento. Consulta su estado.',
        );
      const ahora = new Date();
      if (o.bloqueoProcesoHasta && o.bloqueoProcesoHasta > ahora)
        return { r, o, token: null };
      const token = randomUUID(),
        hasta = new Date(ahora.getTime() + 60_000);
      o = await tx.operacionRecepcionCompra.update({
        where: { id: o.id },
        data: {
          tokenProceso: token,
          bloqueoProcesoHasta: hasta,
          proximaRevisionEn: hasta,
          intentosProceso: { increment: 1 },
        },
      });
      return { r, o, token };
    });
  }
  async procesar(
    id: string,
    cuerpo: unknown,
    identidad: IdentidadPedido,
    admin?: Administracion,
  ) {
    id = DatosInstruccionPago.uuid(id);
    if (!identidad.sesion && !identidad.accesoInvitadoHash)
      throw new UnauthorizedException();
    const d = DatosProcesamientoRecepcion.leer(cuerpo),
      hash = this.hash(id, d, identidad, admin);
    let tomada;
    try {
      tomada = await this.iniciar(id, d, identidad, hash, admin);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const encontrada = await this.consultar(
        id,
        d.claveSolicitud,
        identidad,
        hash,
        admin,
      );
      if (encontrada && encontrada.o.estado !== 'PENDIENTE')
        return this.final(encontrada.o, encontrada.r);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('La clave corresponde a otra operación.');
      throw new ServiceUnavailableException(
        'No se pudo confirmar el inicio. Recupera la operación con su misma clave.',
      );
    }
    if (tomada.o.estado !== 'PENDIENTE') return this.final(tomada.o, tomada.r);
    if (!tomada.token) return this.incompleta(tomada.r, d.claveSolicitud);
    const { o, r, token } = tomada,
      c = r.comprobantes.find((c) => c.id === o.comprobanteId)!;
    try {
      await this.archivos.copiarReservado(
        {
          clave: c.archivoClave,
          sha256: c.archivoSha256,
          formato: c.formato,
          tamanoBytes: c.tamanoBytes,
        },
        this.copia(o),
      );
      return await this.confirmar(id, o.id, token, identidad, admin);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException
      )
        throw error;
      const encontrada = await this.consultar(
        id,
        d.claveSolicitud,
        identidad,
        hash,
        admin,
      );
      if (encontrada && encontrada.o.estado !== 'PENDIENTE')
        return this.final(encontrada.o, encontrada.r);
      if (encontrada)
        await this.escritura.transaccion(async (tx) => {
          await this.bloquear(tx, id, identidad, admin);
          await tx.operacionRecepcionCompra.updateMany({
            where: { id: o.id, estado: 'PENDIENTE', tokenProceso: token },
            data: {
              tokenProceso: null,
              bloqueoProcesoHasta: null,
              proximaRevisionEn: new Date(Date.now() + 5_000),
              ultimaIncidencia:
                'Procesamiento pendiente de recuperación. Conservar la referencia y la misma clave.',
            },
          });
        });
      throw new ServiceUnavailableException(
        'No se pudo confirmar el procesamiento. Conserva la recepción y recupera la misma operación.',
      );
    }
  }
  private async consultar(
    id: string,
    clave: string,
    identidad: IdentidadPedido,
    hash?: string,
    admin?: Administracion,
  ) {
    return this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, identidad, admin),
        o = await tx.operacionRecepcionCompra.findUnique({
          where: { claveSolicitud: clave },
        });
      if (
        !o ||
        o.recepcionId !== id ||
        o.accion !== (admin ? 'REGISTRAR_PEDIDO' : 'PROCESAR') ||
        (admin && o.responsableId !== admin.sesion.usuario.id)
      )
        return null;
      if (
        o.solicitudHash !==
        (hash ??
          this.hash(
            id,
            { claveSolicitud: clave, versionEsperada: o.versionEsperada },
            identidad,
            admin,
          ))
      )
        throw new ConflictException('La clave corresponde a otra solicitud.');
      return { r, o };
    });
  }
  async recuperar(
    id: string,
    clave: string,
    identidad: IdentidadPedido,
    admin?: Administracion,
  ) {
    id = DatosInstruccionPago.uuid(id);
    clave = DatosInstruccionPago.uuid(clave);
    const e = await this.consultar(id, clave, identidad, undefined, admin);
    if (!e) throw new NotFoundException('Operación no encontrada.');
    if (e.o.estado !== 'PENDIENTE') return this.final(e.o, e.r);
    if (
      (e.o.bloqueoProcesoHasta &&
        e.o.bloqueoProcesoHasta.getTime() > Date.now()) ||
      (e.o.proximaRevisionEn && e.o.proximaRevisionEn.getTime() > Date.now())
    )
      return this.incompleta(e.r, clave);
    return this.procesar(
      id,
      { claveSolicitud: clave, versionEsperada: e.o.versionEsperada },
      identidad,
      admin,
    );
  }
  private confirmar(
    id: string,
    operacionId: string,
    token: string,
    identidad: IdentidadPedido,
    admin?: Administracion,
  ) {
    return this.escritura.transaccion(async (tx) => {
      let r = await this.bloquear(tx, id, identidad, admin);
      const o = await tx.operacionRecepcionCompra.findUniqueOrThrow({
        where: { id: operacionId },
      });
      if (o.estado !== 'PENDIENTE') return this.final(o, r);
      if (o.tokenProceso !== token) return this.incompleta(r, o.claveSolicitud);
      if (
        r.estado !== (admin ? 'REQUIERE_ATENCION' : 'RECIBIDA') ||
        r.version !== o.versionEsperada ||
        r.comprobanteActualId !== o.comprobanteId
      )
        throw new ConflictException(
          'La recepción cambió. Consulta su estado antes de continuar.',
        );
      await tx.operacionRecepcionCompra.update({
        where: { id: o.id },
        data: {
          archivoPedidoEstado: 'DISPONIBLE',
          archivoPedidoConfirmadoEn: new Date(),
        },
      });
      await tx.$queryRaw`SELECT id FROM configuracion_reserva WHERE id=1 FOR UPDATE`;
      const politica = await tx.configuracionReserva.findUnique({
        where: { id: 1 },
      });
      if (!politica)
        throw new ServiceUnavailableException(
          'La configuración de reservas no está disponible.',
        );
      const instruccion = RespuestaInstruccionPago.leer(
        r.instruccion,
        this.config.accesoInvitadoMs,
      );
      let verificada:
          | Awaited<ReturnType<PreparacionPedidoService['verificar']>>
          | undefined,
        motivo: string | undefined;
      try {
        verificada = await this.preparacion.verificar(
          tx,
          instruccion.preparacion,
          !!admin,
        );
        await this.inventario.bloquear(
          tx,
          verificada.lineas.map((l) => l.variante.id),
        );
        if (
          verificada.lineas.some(
            (l, n) =>
              instruccion.verificacion.articulos[n].varianteId !==
                l.variante.id ||
              instruccion.verificacion.articulos[n].productoId !==
                l.producto.id,
          )
        )
          throw new ConflictException({ codigo: 'PREPARACION_INCONSISTENTE' });
      } catch (error) {
        const codigo =
          error instanceof HttpException
            ? (error.getResponse() as { codigo?: string }).codigo
            : undefined;
        if (!codigo || !COMERCIALES.includes(codigo)) throw error;
        motivo = codigo;
      }
      if (admin) await this.escritura.comprobarSesion(tx, admin.sesion, true);
      else await this.recepciones.autorizar(tx, r, identidad);
      const ahora = new Date();
      if (motivo) {
        r = await tx.recepcionCompra.update({
          where: { id },
          data: {
            estado: 'REQUIERE_ATENCION',
            version: { increment: 1 },
            motivos: [motivo],
          },
          include: INCLUIR_RECEPCION,
        });
      } else {
        const datos = await this.registro.datos(
          tx,
          { ...instruccion.preparacion, claveCreacion: r.claveCreacionPedido },
          identidad,
          DatosInstruccionPago.huella({
            versionContrato: 1,
            origen: 'RECEPCION',
            recepcionId: id,
            preparacionHash: r.instruccion.preparacionHash,
          }),
          politica,
          verificada!,
          ahora,
          admin ? r.instruccion : undefined,
        );
        const pedido = await tx.pedido.create({ data: datos });
        await tx.instruccionPago.update({
          where: { id: r.instruccionId },
          data: { pedidoId: pedido.id },
        });
        const pago = await tx.pagoPedido.create({
          data: {
            pedidoId: pedido.id,
            instruccionId: r.instruccionId,
            metodo: r.instruccion.metodo,
          },
        });
        r = await tx.recepcionCompra.update({
          where: { id },
          data: {
            estado: 'PEDIDO_CREADO',
            version: { increment: 1 },
            motivos: [],
            pedidoId: pedido.id,
            pagoId: pago.id,
            pedidoRegistradoEn: ahora,
          },
          include: INCLUIR_RECEPCION,
        });
        const c = await tx.comprobanteRecepcionCompra.update({
          where: { id: o.comprobanteId },
          data: { pagoDestinoId: pago.id },
        });
        const copia = this.copia(o);
        await tx.comprobantePago.create({
          data: {
            pagoId: pago.id,
            version: 1,
            comprobanteRecepcionId: c.id,
            archivoClave: copia.clave,
            archivoSha256: copia.sha256,
            formato: copia.formato,
            tamanoBytes: copia.tamanoBytes,
            nombreArchivo: c.nombreArchivo,
            numeroOperacion: c.numeroOperacion,
            creadoEn: ahora,
          },
        });
      }
      const respuesta = Respuesta.crear(
        r,
        o.claveSolicitud,
        this.config.accesoInvitadoMs,
      );
      const terminada = await tx.operacionRecepcionCompra.update({
        where: { id: o.id },
        data: {
          estado: 'CONFIRMADA',
          versionResultante: r.version,
          despues: Respuesta.estado(r) as Prisma.InputJsonValue,
          respuesta: respuesta as Prisma.InputJsonValue,
          codigoHttp: 200,
          finalizadoEn: new Date(),
          tokenProceso: null,
          bloqueoProcesoHasta: null,
          proximaRevisionEn: null,
          ultimaIncidencia: null,
        },
      });
      return this.final(terminada, r);
    });
  }
  registrarAdmin(id: string, cuerpo: unknown, sesion: ContextoAuth) {
    const datos = DatosAtencionRecepcion.accion(cuerpo, true);
    return this.procesar(
      id,
      {
        claveSolicitud: datos.claveSolicitud,
        versionEsperada: datos.versionEsperada,
      },
      { sesion },
      { sesion, datos },
    );
  }
  async recuperarAdmin(id: string, clave: string, sesion: ContextoAuth) {
    id = DatosInstruccionPago.uuid(id);
    clave = DatosInstruccionPago.uuid(clave);
    const o = await this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const o = await tx.operacionRecepcionCompra.findUnique({
        where: { claveSolicitud: clave },
      });
      if (
        !o ||
        o.recepcionId !== id ||
        o.accion !== 'REGISTRAR_PEDIDO' ||
        o.responsableId !== sesion.usuario.id
      )
        throw new NotFoundException('Operación no encontrada.');
      return o;
    });
    const datos = DatosAtencionRecepcion.accion(
      {
        claveSolicitud: clave,
        versionEsperada: o.versionEsperada,
        comprobanteActualId: o.comprobanteId,
        motivo: o.motivo,
        confirmado: true,
        aceptarCondicionesOriginales: true,
      },
      true,
    );
    return this.recuperar(id, clave, { sesion }, { sesion, datos });
  }
}
