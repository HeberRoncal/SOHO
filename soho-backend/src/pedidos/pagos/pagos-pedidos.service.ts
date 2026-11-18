import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { respuestaPedido } from '../dto/respuesta-pedido.js';
import {
  INCLUIR_ADMIN,
  respuestaAdmin,
  type PedidoAdmin,
} from '../dto/respuesta-administracion.js';
import { EscrituraPedidoService } from '../seguridad/escritura-pedido.service.js';
import type { DecisionPagoDto } from '../dto/decision-pago.dto.js';
import type { CorregirComprobanteDto } from '../dto/corregir-comprobante.dto.js';
import type { IdentidadPedido } from '../seguridad/sesion-pedido.guard.js';
import { ComprobantesPrivadosService } from '../archivos/comprobantes-privados.service.js';
import { EstadoReservasPedido } from '../reservas/estado-reservas-pedido.js';

function conflicto(
  message = 'El pedido o el comprobante cambió. Actualiza antes de continuar.',
): never {
  throw new ConflictException({ codigo: 'REVISION_CAMBIADA', message });
}

@Injectable()
export class PagosPedidosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ComprobantesPrivadosService)
    private readonly archivos: ComprobantesPrivadosService,
    @Inject(EscrituraPedidoService)
    private readonly escritura: EscrituraPedidoService,
  ) {}

  async detalle(codigo: string) {
    const p = await this.prisma.pedido.findUnique({
      where: { codigo },
      include: INCLUIR_ADMIN,
    });
    if (!p) throw new NotFoundException('Pedido no encontrado.');
    return { pedido: respuestaAdmin(p) };
  }

  async listar(q: Record<string, unknown>) {
    const entero = (v: unknown, def: number, max: number) => {
      if (v === undefined) return def;
      if (typeof v !== 'string' || !/^[1-9][0-9]{0,4}$/.test(v) || +v > max)
        throw new BadRequestException('Paginación inválida.');
      return +v;
    };
    const pagina = entero(q.pagina, 1, 10000),
      limite = entero(q.limite, 20, 50);
    if (
      q.estado !== undefined &&
      !['PENDIENTE', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO'].includes(
        q.estado as string,
      )
    )
      throw new BadRequestException('Estado inválido.');
    if (
      q.metodo !== undefined &&
      !['YAPE', 'PLIN'].includes(q.metodo as string)
    )
      throw new BadRequestException('Método inválido.');
    if (
      q.busqueda !== undefined &&
      (typeof q.busqueda !== 'string' || q.busqueda.length > 120)
    )
      throw new BadRequestException('Búsqueda inválida.');
    if (
      q.entrega !== undefined &&
      ![
        'PENDIENTE',
        'CONFIRMADO',
        'EN_PREPARACION',
        'INCIDENCIA',
        'ENVIADO',
        'ENTREGADO',
        'CANCELADO',
        'POR_PREPARAR',
      ].includes(q.entrega as string)
    )
      throw new BadRequestException('Entrega inválida.');
    if (
      q.cliente !== undefined &&
      !['registrado', 'invitado'].includes(q.cliente as string)
    )
      throw new BadRequestException('Cliente inválido.');
    if (
      q.orden !== undefined &&
      !['recientes', 'antiguos', 'total-mayor', 'total-menor'].includes(
        q.orden as string,
      )
    )
      throw new BadRequestException('Orden inválido.');
    const fecha = (v: unknown) => {
      if (
        typeof v !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v
      )
        throw new BadRequestException('Fecha inválida.');
      return new Date(v + 'T05:00:00Z');
    };
    const desde = q.desde ? fecha(q.desde) : undefined,
      hasta = q.hasta
        ? new Date(fecha(q.hasta).getTime() + 86400000)
        : undefined;
    if (desde && hasta && desde >= hasta)
      throw new BadRequestException('Período inválido.');
    const texto = (q.busqueda as string | undefined)?.trim();
    if (q.reserva !== undefined && q.reserva !== 'vencida')
      throw new BadRequestException('Filtro de reserva inválido.');
    const where: Prisma.PedidoWhereInput = {
      ...(texto
        ? {
            AND: texto.split(/\s+/).map((t) => ({
              OR: [
                { codigo: { contains: t } },
                { nombres: { contains: t } },
                { apellidos: { contains: t } },
                { correo: { contains: t } },
                {
                  pago: {
                    comprobantes: {
                      some: { numeroOperacion: { contains: t } },
                    },
                  },
                },
              ],
            })),
          }
        : {}),
      ...(q.entrega
        ? q.entrega === 'POR_PREPARAR'
          ? { estadoEntrega: { in: ['CONFIRMADO', 'EN_PREPARACION'] } }
          : { estadoEntrega: q.entrega as 'PENDIENTE' }
        : {}),
      ...(q.cliente
        ? { usuarioId: q.cliente === 'invitado' ? null : { not: null } }
        : {}),
      ...(desde || hasta ? { creadoEn: { gte: desde, lt: hasta } } : {}),
      pago: {
        ...(q.metodo ? { metodo: q.metodo as 'YAPE' | 'PLIN' } : {}),
        ...(q.estado ? { estado: q.estado as 'PENDIENTE' } : {}),
      },
    };
    if (q.entrega === 'POR_PREPARAR')
      where.pago = {
        is: {
          estado: 'APROBADO',
          ...(q.metodo ? { metodo: q.metodo as 'YAPE' | 'PLIN' } : {}),
        },
      };
    const orden: Prisma.PedidoOrderByWithRelationInput[] =
      q.orden === 'antiguos'
        ? [{ creadoEn: 'asc' }, { id: 'asc' }]
        : q.orden === 'total-mayor' || q.orden === 'total-menor'
          ? [
              { total: q.orden === 'total-mayor' ? 'desc' : 'asc' },
              { creadoEn: 'desc' },
              { id: 'desc' },
            ]
          : [{ actualizadoEn: 'desc' }, { id: 'desc' }];
    return this.prisma.$transaction(
      async (tx) => {
        if (q.reserva === 'vencida')
          where.id = { in: await EstadoReservasPedido.idsConVencimiento(tx) };
        const total = await tx.pedido.count({ where });
        const pedidos = await tx.pedido.findMany({
          where,
          include: INCLUIR_ADMIN,
          orderBy: orden,
          skip: (pagina - 1) * limite,
          take: limite,
        });
        const grupos = await tx.pagoPedido.groupBy({
          by: ['estado'],
          _count: true,
        });
        return {
          pedidos: pedidos.map(respuestaAdmin),
          conteos: Object.fromEntries(grupos.map((g) => [g.estado, g._count])),
          paginacion: {
            pagina,
            limite,
            total,
            paginas: Math.ceil(total / limite),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async resumen(desde: string, hasta: string) {
    const fecha = (v: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v;
    if (
      !fecha(desde) ||
      !fecha(hasta) ||
      desde > hasta ||
      Date.parse(hasta) - Date.parse(desde) > 365 * 86400000
    )
      throw new BadRequestException(
        'Selecciona un período válido de hasta 366 días.',
      );
    const inicio = new Date(desde + 'T05:00:00Z'),
      fin = new Date(Date.parse(hasta + 'T05:00:00Z') + 86400000);
    return this.prisma.$transaction(
      async (tx) => {
        const consultar = (where: Prisma.PedidoWhereInput, take = 5) =>
          tx.pedido
            .findMany({
              where,
              include: INCLUIR_ADMIN,
              take,
              orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
            })
            .then((lista) => lista.map(respuestaAdmin));
        const pendientes = await consultar({ pago: { estado: 'PENDIENTE' } }),
          observados = await consultar({ pago: { estado: 'OBSERVADO' } }),
          prepararWhere: Prisma.PedidoWhereInput = {
            pago: { estado: 'APROBADO' },
            estadoEntrega: { in: ['CONFIRMADO', 'EN_PREPARACION'] },
          };
        const vencimientoWhere: Prisma.PedidoWhereInput = {
          id: { in: await EstadoReservasPedido.idsConVencimiento(tx) },
        };
        const porPreparar = await consultar(prepararWhere),
          reservasVencidas = await consultar(vencimientoWhere),
          incidencias = await consultar({ estadoEntrega: 'INCIDENCIA' }),
          recientes = await consultar({}, 7);
        const grupos = await tx.pagoPedido.groupBy({
          by: ['estado'],
          _count: true,
        });
        const porPrepararTotal = await tx.pedido.count({
            where: prepararWhere,
          }),
          incidenciasTotal = await tx.pedido.count({
            where: { estadoEntrega: 'INCIDENCIA' },
          });
        const reservasVencidasTotal = await tx.pedido.count({
          where: vencimientoWhere,
        });
        const importe = await tx.pedido.aggregate({
          where: { pago: { estado: { in: ['PENDIENTE', 'OBSERVADO'] } } },
          _sum: { total: true },
        });
        const ventas = await tx.$queryRaw<
          Array<{ dia: string; importe: Prisma.Decimal; pedidos: bigint }>
        >`SELECT DATE_FORMAT(CONVERT_TZ(c.revisado_en,'+00:00','-05:00'),'%Y-%m-%d') AS dia, SUM(p.total) AS importe, COUNT(*) AS pedidos FROM comprobantes_pago c INNER JOIN pagos_pedido pg ON pg.id=c.pago_id INNER JOIN pedidos p ON p.id=pg.pedido_id WHERE pg.estado='APROBADO' AND c.estado_revision='APROBADO' AND c.revisado_en >= ${inicio} AND c.revisado_en < ${fin} GROUP BY dia ORDER BY dia`;
        return {
          pendientes,
          observados,
          porPreparar,
          reservasVencidas,
          reservasVencidasTotal,
          incidencias,
          recientes,
          conteos: Object.fromEntries(grupos.map((g) => [g.estado, g._count])),
          porPrepararTotal,
          incidenciasTotal,
          importePendiente: importe._sum.total?.toFixed(2) ?? '0.00',
          ventas: ventas.map((v) => ({
            dia: v.dia,
            importe: Number(v.importe),
            pedidos: Number(v.pedidos),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private sesion(
    tx: Prisma.TransactionClient,
    identidad: IdentidadPedido,
    admin: boolean,
  ) {
    return this.escritura.sesion(tx, identidad, admin);
  }
  private bloquear(tx: Prisma.TransactionClient, codigo: string) {
    return this.escritura.bloquear(tx, codigo);
  }
  private async evento(
    tx: Prisma.TransactionClient,
    p: PedidoAdmin,
    tipo:
      | 'PAGO_APROBADO'
      | 'PAGO_OBSERVADO'
      | 'PAGO_RECHAZADO'
      | 'RESERVA_LIBERADA'
      | 'COMPROBANTE_ADJUNTADO',
    titulo: string,
    descripcion: string,
    identidad: IdentidadPedido,
    secuencia: number,
  ) {
    await tx.eventoPedido.create({
      data: {
        pedidoId: p.id,
        secuencia,
        versionPedido: p.version + 1,
        tipo,
        titulo,
        descripcion,
        visibilidad: 'CLIENTE',
        actor: identidad.sesion
          ? identidad.sesion.usuario.rol === 'ADMIN'
            ? 'ADMIN'
            : 'CLIENTE'
          : 'SISTEMA',
        responsableId: identidad.sesion?.usuario.id,
      },
    });
  }
  private transaccion<T>(
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.escritura.transaccion(operacion);
  }
  async decidir(codigo: string, d: DecisionPagoDto, sesion: ContextoAuth) {
    return this.transaccion(async (tx) => {
      const identidad = { sesion };
      await this.sesion(tx, identidad, true);
      const p = await this.bloquear(tx, codigo),
        pago = p.pago!,
        c = pago.comprobantes[0];
      if (
        !c ||
        p.estadoEntrega === 'CANCELADO' ||
        p.version !== d.versionPedido ||
        pago.version !== d.versionPago ||
        c.id !== d.comprobanteId ||
        pago.estado !== 'PENDIENTE' ||
        c.estadoRevision !== 'PENDIENTE'
      )
        conflicto();
      if (
        d.accion === 'APROBADO' &&
        (p.estadoEntrega === 'INCIDENCIA' ||
          p.articulos.some(
            (a) =>
              a.reservas
                .filter(
                  (r) =>
                    r.estado === 'ACTIVA' &&
                    !(
                      r.accionVencimiento === 'LIBERAR_Y_ALERTAR' &&
                      r.venceEn &&
                      r.venceEn.getTime() <= Date.now()
                    ),
                )
                .reduce((n, r) => n + r.cantidad, 0) !== a.cantidad,
          ))
      )
        conflicto('Las reservas requieren revisión antes de aprobar el pago.');
      await tx.comprobantePago.update({
        where: { id: c.id },
        data: {
          estadoRevision: d.accion,
          motivo: d.motivo ?? null,
          mensaje: d.mensaje ?? null,
          solicitudCorreccion: d.solicitud ?? null,
          revisadoPorId: sesion.usuario.id,
          revisadoEn: new Date(),
        },
      });
      await tx.pagoPedido.update({
        where: { id: pago.id },
        data: { estado: d.accion, version: { increment: 1 } },
      });
      await tx.pedido.update({
        where: { id: p.id },
        data: {
          version: { increment: 1 },
          ...(d.accion === 'APROBADO' && p.estadoEntrega === 'PENDIENTE'
            ? { estadoEntrega: 'CONFIRMADO' }
            : {}),
        },
      });
      let secuencia = (p.eventos.at(-1)?.secuencia ?? 0) + 1;
      await this.evento(
        tx,
        p,
        `PAGO_${d.accion}`,
        d.accion === 'APROBADO'
          ? 'Pago aprobado'
          : d.accion === 'OBSERVADO'
            ? 'Comprobante observado'
            : 'Pago rechazado',
        d.mensaje ?? 'SOHO verificó el ingreso. El pedido está confirmado.',
        identidad,
        secuencia++,
      );
      if (d.accion === 'RECHAZADO') {
        for (const a of [...p.articulos].sort((a, b) =>
          a.varianteId.localeCompare(b.varianteId),
        )) {
          const activas = a.reservas.filter((r) => r.estado === 'ACTIVA'),
            cantidad = activas.reduce((n, r) => n + r.cantidad, 0);
          if (!cantidad) continue;
          const actualizado = await tx.variante.updateMany({
            where: { id: a.varianteId, cantidadReservada: { gte: cantidad } },
            data: { cantidadReservada: { decrement: cantidad } },
          });
          if (actualizado.count !== 1)
            conflicto('El inventario reservado necesita conciliación.');
          await tx.reservaInventario.updateMany({
            where: { id: { in: activas.map((r) => r.id) }, estado: 'ACTIVA' },
            data: {
              estado: 'LIBERADA',
              cerradaEn: new Date(),
              motivoCierre: 'Pago rechazado',
            },
          });
        }
        await this.evento(
          tx,
          p,
          'RESERVA_LIBERADA',
          'Reserva liberada',
          'Las unidades reservadas vuelven a estar disponibles. El rechazo no cancela el pedido ni realiza un reembolso.',
          identidad,
          secuencia,
        );
      }
      return {
        pedido: respuestaAdmin(
          await tx.pedido.findUniqueOrThrow({
            where: { id: p.id },
            include: INCLUIR_ADMIN,
          }),
        ),
      };
    });
  }
  private propietario(p: PedidoAdmin, identidad: IdentidadPedido) {
    const permitido = identidad.sesion
      ? p.usuarioId === identidad.sesion.usuario.id
      : p.usuarioId === null &&
        !!identidad.accesoInvitadoHash &&
        p.accesoInvitadoHash === identidad.accesoInvitadoHash &&
        !!p.accesoInvitadoExpiraEn &&
        p.accesoInvitadoExpiraEn.getTime() > Date.now();
    if (!permitido) throw new NotFoundException('Pedido no encontrado.');
  }
  async corregir(
    codigo: string,
    d: CorregirComprobanteDto,
    identidad: IdentidadPedido,
  ) {
    const previo = await this.prisma.pedido.findUnique({
      where: { codigo },
      include: INCLUIR_ADMIN,
    });
    if (!previo) throw new NotFoundException('Pedido no encontrado.');
    this.propietario(previo, identidad);
    const preparado = await this.archivos.preparar(
      this.archivos.decodificar(d.comprobante.contenidoBase64),
      d.comprobante.tipoArchivo,
    );
    const archivo = await this.archivos.guardar(preparado);
    let conservado = false;
    try {
      const resultado = await this.transaccion(async (tx) => {
        await this.sesion(tx, identidad, false);
        const p = await this.bloquear(tx, codigo),
          pago = p.pago!,
          actual = pago.comprobantes[0];
        this.propietario(p, identidad);
        const anterior = pago.comprobantes.find(
          (c) => c.id === d.comprobanteId,
        );
        if (p.estadoEntrega === 'CANCELADO') conflicto();
        // Reintento de la misma corrección después de perder la respuesta o competir por el bloqueo.
        if (
          anterior?.estadoRevision === 'OBSERVADO' &&
          actual?.version === anterior.version + 1 &&
          actual.archivoSha256 === archivo.sha256 &&
          actual.nombreArchivo === d.comprobante.nombreArchivo &&
          actual.numeroOperacion === (d.comprobante.numeroOperacion ?? null)
        )
          return { pedido: respuestaPedido(p), reutilizado: true };
        if (
          !actual ||
          actual.id !== d.comprobanteId ||
          p.version !== d.versionPedido ||
          pago.version !== d.versionPago ||
          pago.estado !== 'OBSERVADO' ||
          actual.estadoRevision !== 'OBSERVADO'
        )
          conflicto();
        if (actual.version >= 100)
          conflicto(
            'El pedido alcanzó el límite de comprobantes. Contacta con SOHO.',
          );
        await tx.comprobantePago.create({
          data: {
            pagoId: pago.id,
            version: actual.version + 1,
            archivoClave: archivo.clave,
            archivoSha256: archivo.sha256,
            nombreArchivo: d.comprobante.nombreArchivo,
            formato: archivo.formato,
            tamanoBytes: archivo.tamanoBytes,
            numeroOperacion: d.comprobante.numeroOperacion,
          },
        });
        await tx.pagoPedido.update({
          where: { id: pago.id },
          data: { estado: 'PENDIENTE', version: { increment: 1 } },
        });
        await tx.pedido.update({
          where: { id: p.id },
          data: { version: { increment: 1 } },
        });
        await this.evento(
          tx,
          p,
          'COMPROBANTE_ADJUNTADO',
          'Comprobante corregido recibido',
          'La nueva versión está pendiente de revisión. No es otro pago ni otra compra.',
          identidad,
          (p.eventos.at(-1)?.secuencia ?? 0) + 1,
        );
        return {
          pedido: respuestaPedido(
            await tx.pedido.findUniqueOrThrow({
              where: { id: p.id },
              include: INCLUIR_ADMIN,
            }),
          ),
          reutilizado: false,
        };
      });
      conservado = !resultado.reutilizado;
      return resultado;
    } catch (error) {
      // Comprueba el objeto persistido antes de limpiar un resultado de COMMIT incierto.
      try {
        const existe = await this.prisma.comprobantePago.findUnique({
          where: { archivoClave: archivo.clave },
        });
        if (existe) {
          conservado = true;
          const p = await this.prisma.pedido.findUniqueOrThrow({
            where: { codigo },
            include: INCLUIR_ADMIN,
          });
          return { pedido: respuestaPedido(p), reutilizado: true };
        }
      } catch {
        conservado = true;
        throw new ServiceUnavailableException(
          'No pudimos confirmar la corrección. Actualiza el pedido antes de reintentar.',
        );
      }
      throw error;
    } finally {
      if (!conservado) await this.archivos.eliminar(archivo.clave);
    }
  }
}
