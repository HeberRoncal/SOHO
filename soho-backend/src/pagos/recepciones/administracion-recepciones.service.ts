import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import { ConfiguracionPedidos } from '../../pedidos/configuracion-pedidos.js';
import { PreparacionPedidoService } from '../../pedidos/preparacion/preparacion-pedido.service.js';
import { InventarioReservadoService } from '../../inventario/reservas/inventario-reservado.service.js';
import { ComprobantesPrivadosService } from '../../pedidos/archivos/comprobantes-privados.service.js';
import { escaparLike } from '../../productos/dto/consulta-productos.js';
import { DatosInstruccionPago } from '../dto/datos-instruccion-pago.js';
import { RespuestaInstruccionPago } from '../dto/respuesta-instruccion-pago.js';
import { RecepcionesCompraService } from './recepciones-compra.service.js';
import { ProcesamientoRecepcionService } from './procesamiento-recepcion.service.js';
import { DatosAtencionRecepcion } from './datos-atencion-recepcion.js';
import { RespuestaAtencionRecepcion } from './respuesta-atencion-recepcion.js';
import { RespuestaRecepcionCompra } from './respuesta-recepcion-compra.js';
import { RespuestaProcesamientoRecepcion } from './respuesta-procesamiento-recepcion.js';
import {
  INCLUIR_RECEPCION,
  type RecepcionCompra,
} from './recepcion-compra.interface.js';

@Injectable()
export class AdministracionRecepcionesService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
    @Inject(RecepcionesCompraService)
    private readonly recepciones: RecepcionesCompraService,
    @Inject(ProcesamientoRecepcionService)
    private readonly procesamiento: ProcesamientoRecepcionService,
    @Inject(ConfiguracionPedidos) private readonly config: ConfiguracionPedidos,
    @Inject(PreparacionPedidoService)
    private readonly preparacion: PreparacionPedidoService,
    @Inject(InventarioReservadoService)
    private readonly inventario: InventarioReservadoService,
    @Inject(ComprobantesPrivadosService)
    private readonly archivos: ComprobantesPrivadosService,
  ) {}
  private async bloquear(
    tx: Prisma.TransactionClient,
    id: string,
    s: ContextoAuth,
  ) {
    const r = await this.recepciones.bloquear(tx, id);
    await this.escritura.comprobarSesion(tx, s, true);
    if (r.estado !== 'RECIBIENDO')
      RespuestaRecepcionCompra.inicial(r, this.config.accesoInvitadoMs);
    return r;
  }
  listar(v: unknown, s: ContextoAuth) {
    const q = DatosAtencionRecepcion.consulta(v),
      buscar = escaparLike(q.busqueda);
    const where: Prisma.RecepcionCompraWhereInput = {
      ...(q.estado ? { estado: q.estado } : {}),
      ...(buscar
        ? {
            OR: [
              { referencia: { contains: buscar } },
              { pedido: { codigo: { contains: buscar } } },
              {
                instruccion: {
                  usuario: {
                    OR: [
                      { correo: { contains: buscar } },
                      { nombres: { contains: buscar } },
                      { apellidos: { contains: buscar } },
                    ],
                  },
                },
              },
              {
                instruccion: {
                  respuesta: {
                    path: '$.preparacion.contacto.correo',
                    string_contains: buscar,
                  },
                },
              },
            ],
          }
        : {}),
    };
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, s, true);
      const total = await tx.recepcionCompra.count({ where }),
        grupos = await tx.recepcionCompra.groupBy({
          by: ['estado'],
          _count: true,
        }),
        filas = await tx.recepcionCompra.findMany({
          where,
          skip: (q.pagina - 1) * q.limite,
          take: q.limite,
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          include: INCLUIR_RECEPCION,
        });
      return {
        recepciones: filas.map((r) => {
          const i = RespuestaInstruccionPago.leer(
            r.instruccion,
            this.config.accesoInvitadoMs,
          );
          return {
            id: r.id,
            referencia: r.referencia,
            estado: r.estado,
            version: r.version,
            creadoEn: r.creadoEn.toISOString(),
            contacto: i.preparacion.contacto,
            metodo: i.metodo,
            importeReferencia: i.importeReferencia,
            distrito: i.preparacion.entrega.distrito,
            motivos: r.motivos,
            pedido: r.pedido,
            comprador: r.instruccion.usuarioId ? 'CUENTA' : 'INVITADO',
          };
        }),
        paginacion: {
          pagina: q.pagina,
          limite: q.limite,
          total,
          paginas: Math.ceil(total / q.limite),
        },
        resumen: Object.fromEntries(
          ['RECIBIENDO', 'RECIBIDA', 'REQUIERE_ATENCION', 'PEDIDO_CREADO'].map(
            (estado) => [
              estado,
              grupos.find((g) => g.estado === estado)?._count ?? 0,
            ],
          ),
        ),
      };
    });
  }
  private async diagnostico(
    tx: Prisma.TransactionClient,
    r: RecepcionCompra,
    originales: boolean,
  ) {
    try {
      const i = RespuestaInstruccionPago.leer(
          r.instruccion,
          this.config.accesoInvitadoMs,
        ),
        p = await this.preparacion.verificar(tx, i.preparacion, originales);
      await this.inventario.bloquear(
        tx,
        p.lineas.map((l) => l.variante.id),
      );
      if (
        p.lineas.some(
          (l, n) =>
            i.verificacion.articulos[n].varianteId !== l.variante.id ||
            i.verificacion.articulos[n].productoId !== l.producto.id,
        )
      )
        return { apto: false, motivos: ['PREPARACION_INCONSISTENTE'] };
      return { apto: true, motivos: [] as string[] };
    } catch (error) {
      const codigo =
        error instanceof HttpException
          ? (error.getResponse() as { codigo?: string }).codigo
          : undefined;
      if (!codigo) {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException(
          'El diagnóstico no está disponible temporalmente. Conserva la recepción.',
        );
      }
      return { apto: false, motivos: [codigo] };
    }
  }
  async detalle(id: string, s: ContextoAuth) {
    id = DatosInstruccionPago.uuid(id);
    return this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, s),
        actual = await this.diagnostico(tx, r, false),
        originales = await this.diagnostico(tx, r, true),
        pendientes = await tx.operacionRecepcionCompra.count({
          where: { recepcionId: id, estado: 'PENDIENTE' },
        }),
        historial = await tx.operacionRecepcionCompra.findMany({
          where: { recepcionId: id },
          orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
          include: {
            responsable: {
              select: { id: true, nombres: true, apellidos: true },
            },
          },
        }),
        correccion = (r.motivos as string[]).includes(
          'COMPROBANTE_REQUIERE_CORRECCION',
        );
      return {
        ...RespuestaRecepcionCompra.actual(r, this.config.accesoInvitadoMs),
        diagnostico: { actual, condicionesOriginales: originales },
        comprobantes: r.comprobantes.map((c) => ({
          id: c.id,
          version: c.version,
          formato: c.formato,
          tamanoBytes: c.tamanoBytes,
          nombreArchivo: c.nombreArchivo,
          numeroOperacion: c.numeroOperacion,
          estadoArchivo: c.estadoArchivo,
          confirmadoEn: c.confirmadoEn?.toISOString() ?? null,
        })),
        historial: historial.map((o) => ({
          id: o.id,
          accion: o.accion,
          estado: o.estado,
          actor: o.actor,
          responsable: o.responsable,
          motivoInterno: o.motivo,
          mensaje: o.mensaje,
          versionEsperada: o.versionEsperada,
          versionResultante: o.versionResultante,
          creadoEn: o.creadoEn.toISOString(),
          finalizadoEn: o.finalizadoEn?.toISOString() ?? null,
        })),
        capacidades: {
          registrarPedido:
            r.estado === 'REQUIERE_ATENCION' &&
            !correccion &&
            !pendientes &&
            originales.apto,
          solicitarCorreccion:
            ['RECIBIDA', 'REQUIERE_ATENCION'].includes(r.estado) &&
            !correccion &&
            !pendientes,
        },
      };
    });
  }
  private huella(
    id: string,
    d: ReturnType<typeof DatosAtencionRecepcion.accion>,
    s: ContextoAuth,
  ) {
    return DatosInstruccionPago.huella({
      versionContrato: 1,
      accion: 'SOLICITAR_CORRECCION',
      recepcionId: id,
      ...d,
      responsableId: s.usuario.id,
    });
  }
  async solicitar(id: string, cuerpo: unknown, s: ContextoAuth) {
    id = DatosInstruccionPago.uuid(id);
    const d = DatosAtencionRecepcion.accion(cuerpo, false),
      hash = this.huella(id, d, s);
    try {
      return await this.escritura.transaccion(async (tx) => {
        let r = await this.bloquear(tx, id, s),
          o = await tx.operacionRecepcionCompra.findUnique({
            where: { claveSolicitud: d.claveSolicitud },
          });
        if (o) {
          if (
            o.recepcionId !== id ||
            o.accion !== 'SOLICITAR_CORRECCION' ||
            o.responsableId !== s.usuario.id ||
            o.solicitudHash !== hash
          )
            throw new ConflictException(
              'La clave corresponde a otra decisión.',
            );
          return {
            codigoHttp: 200,
            respuesta: RespuestaAtencionRecepcion.leer(
              r,
              o,
              this.config.accesoInvitadoMs,
            ),
          };
        }
        if (
          !['RECIBIDA', 'REQUIERE_ATENCION'].includes(r.estado) ||
          r.version !== d.versionEsperada ||
          r.comprobanteActualId !== d.comprobanteActualId ||
          (r.motivos as string[]).includes('COMPROBANTE_REQUIERE_CORRECCION') ||
          (await tx.operacionRecepcionCompra.count({
            where: { recepcionId: id, estado: 'PENDIENTE' },
          }))
        )
          throw new ConflictException(
            'Consulta la recepción y resuelve sus operaciones pendientes antes de solicitar corrección.',
          );
        o = await tx.operacionRecepcionCompra.create({
          data: {
            recepcionId: id,
            comprobanteId: d.comprobanteActualId,
            claveSolicitud: d.claveSolicitud,
            solicitudHash: hash,
            accion: 'SOLICITAR_CORRECCION',
            actor: 'ADMIN',
            responsableId: s.usuario.id,
            motivo: d.motivo,
            mensaje: 'mensaje' in d ? d.mensaje : null,
            versionEsperada: d.versionEsperada,
            antes: RespuestaProcesamientoRecepcion.estado(
              r,
            ) as Prisma.InputJsonValue,
          },
        });
        r = await tx.recepcionCompra.update({
          where: { id },
          data: {
            estado: 'REQUIERE_ATENCION',
            version: { increment: 1 },
            motivos: [
              ...new Set([
                ...(r.motivos as string[]),
                'COMPROBANTE_REQUIERE_CORRECCION',
              ]),
            ],
          },
          include: INCLUIR_RECEPCION,
        });
        const respuesta = RespuestaAtencionRecepcion.crear(
          r,
          o,
          this.config.accesoInvitadoMs,
        );
        o = await tx.operacionRecepcionCompra.update({
          where: { id: o.id },
          data: {
            estado: 'CONFIRMADA',
            versionResultante: r.version,
            despues: RespuestaProcesamientoRecepcion.estado(
              r,
            ) as Prisma.InputJsonValue,
            respuesta: respuesta as Prisma.InputJsonValue,
            codigoHttp: 200,
            finalizadoEn: new Date(),
          },
        });
        return {
          codigoHttp: 200,
          respuesta: RespuestaAtencionRecepcion.leer(
            r,
            o,
            this.config.accesoInvitadoMs,
          ),
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return this.escritura.transaccion(async (tx) => {
        const r = await this.bloquear(tx, id, s),
          o = await tx.operacionRecepcionCompra.findUnique({
            where: { claveSolicitud: d.claveSolicitud },
          });
        if (
          o?.solicitudHash === hash &&
          o.responsableId === s.usuario.id &&
          o.recepcionId === id
        )
          return {
            codigoHttp: 200,
            respuesta: RespuestaAtencionRecepcion.leer(
              r,
              o,
              this.config.accesoInvitadoMs,
            ),
          };
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ConflictException('La clave corresponde a otra decisión.');
        throw error;
      });
    }
  }
  async operacion(id: string, clave: string, s: ContextoAuth) {
    id = DatosInstruccionPago.uuid(id);
    clave = DatosInstruccionPago.uuid(clave);
    const r = await this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, s),
        o = await tx.operacionRecepcionCompra.findUnique({
          where: { claveSolicitud: clave },
        });
      if (
        !o ||
        o.recepcionId !== id ||
        o.responsableId !== s.usuario.id ||
        !['SOLICITAR_CORRECCION', 'REGISTRAR_PEDIDO'].includes(o.accion)
      )
        throw new NotFoundException('Operación no encontrada.');
      if (o.accion === 'REGISTRAR_PEDIDO') return null;
      const d = DatosAtencionRecepcion.accion(
        {
          claveSolicitud: clave,
          versionEsperada: o.versionEsperada,
          comprobanteActualId: o.comprobanteId,
          motivo: o.motivo,
          mensaje: o.mensaje,
          confirmado: true,
        },
        false,
      );
      if (this.huella(id, d, s) !== o.solicitudHash)
        throw new ConflictException(
          'La solicitud registrada requiere revisión.',
        );
      return {
        codigoHttp: 200,
        respuesta: RespuestaAtencionRecepcion.leer(
          r,
          o,
          this.config.accesoInvitadoMs,
        ),
      };
    });
    return r ?? this.procesamiento.recuperarAdmin(id, clave, s);
  }
  async comprobante(id: string, comprobanteId: string, s: ContextoAuth) {
    id = DatosInstruccionPago.uuid(id);
    comprobanteId = DatosInstruccionPago.uuid(comprobanteId);
    const c = await this.escritura.transaccion(async (tx) => {
      const r = await this.bloquear(tx, id, s),
        c = r.comprobantes.find(
          (c) => c.id === comprobanteId && c.estadoArchivo === 'DISPONIBLE',
        );
      if (!c) throw new NotFoundException('Comprobante no encontrado.');
      return c;
    });
    const contenido = await this.archivos.leer(
      c.archivoClave,
      c.archivoSha256,
      c.tamanoBytes,
    );
    await this.escritura.transaccion((tx) =>
      this.escritura.comprobarSesion(tx, s, true),
    );
    return { contenido, formato: c.formato };
  }
}
