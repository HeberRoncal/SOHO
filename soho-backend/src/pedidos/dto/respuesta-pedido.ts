import type { Prisma } from '../../generated/prisma/client.js';

export const INCLUIR_PEDIDO = {
  articulos: {
    orderBy: { orden: 'asc' },
    include: {
      unidades: { orderBy: { numero: 'asc' } },
      reservas: { orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }] },
    },
  },
  facturacion: true,
  envio: true,
  cancelacion: { select: { canceladaEn: true } },
  pago: { include: { comprobantes: { orderBy: { version: 'asc' } } } },
  eventos: { where: { visibilidad: 'CLIENTE' }, orderBy: { secuencia: 'asc' } },
} as const satisfies Prisma.PedidoInclude;

export type PedidoCompleto = Prisma.PedidoGetPayload<{
  include: typeof INCLUIR_PEDIDO;
}>;

export function respuestaPedido(p: PedidoCompleto) {
  return {
    codigo: p.codigo,
    fecha: p.creadoEn.toISOString(),
    version: p.version,
    contacto: { nombres: p.nombres, apellidos: p.apellidos, correo: p.correo },
    entrega: {
      destinatario: p.destinatario,
      celular: p.celular,
      distrito: p.distritoCodigo,
      nombreDistrito: p.distritoNombre,
      provincia: p.provincia,
      departamento: p.departamento,
      direccion: p.direccion,
      referencia: p.referencia,
      plazo: p.plazoEntrega,
    },
    moneda: p.moneda,
    subtotal: p.subtotal.toFixed(2),
    descuento: p.descuento.toFixed(2),
    costoEnvio: p.costoEnvio.toFixed(2),
    total: p.total.toFixed(2),
    estadoEntrega: p.estadoEntrega,
    cancelacion: p.cancelacion
      ? { fecha: p.cancelacion.canceladaEn.toISOString() }
      : null,
    envio: p.envio
      ? {
          transportista: p.envio.transportista,
          referenciaSeguimiento: p.envio.referenciaSeguimiento,
          preparacionIniciadaEn: p.envio.preparacionIniciadaEn.toISOString(),
          despachadoEn: p.envio.despachadoEn?.toISOString() ?? null,
          entregadoEn: p.envio.entregadoEn?.toISOString() ?? null,
        }
      : null,
    facturacion: p.facturacion
      ? {
          tipo: p.facturacion.tipo,
          tipoDocumento: p.facturacion.tipoDocumento,
          numeroDocumento: p.facturacion.numeroDocumento,
          razonSocial: p.facturacion.razonSocial,
          domicilioFiscal: p.facturacion.domicilioFiscal,
        }
      : null,
    articulos: p.articulos.map((a) => ({
      id: a.id,
      sku: a.sku,
      nombreProducto: a.nombreProducto,
      color: a.color,
      talla: a.talla.toString(),
      sistemaTalla: a.sistemaTalla,
      imagen: a.imagen,
      cantidad: a.cantidad,
      precioUnitario: a.precioUnitario.toFixed(2),
      importeBruto: a.importeBruto.toFixed(2),
      descuento: a.descuento.toFixed(2),
      importeNeto: a.importeNeto.toFixed(2),
      unidades: a.unidades.map((u) => ({
        numero: u.numero,
        importeBruto: u.importeBruto.toFixed(2),
        descuento: u.descuento.toFixed(2),
        importeNeto: u.importeNeto.toFixed(2),
      })),
      reservas: a.reservas.map((r) => ({
        cantidad: r.cantidad,
        estado: r.estado,
        venceEn: r.venceEn?.toISOString() ?? null,
        cerradaEn: r.cerradaEn?.toISOString() ?? null,
      })),
    })),
    pago: p.pago
      ? {
          metodo: p.pago.metodo,
          estado: p.pago.estado,
          version: p.pago.version,
          comprobantes: [...p.pago.comprobantes]
            .sort((a, b) => a.version - b.version)
            .map((c) => ({
              id: c.id,
              version: c.version,
              nombreArchivo: c.nombreArchivo,
              tipoArchivo: c.formato,
              tamanoBytes: c.tamanoBytes,
              numeroOperacion: c.numeroOperacion,
              montoInformado: c.montoInformado?.toFixed(2) ?? null,
              estadoRevision: c.estadoRevision,
              motivo: c.motivo,
              mensaje: c.mensaje,
              solicitudCorreccion: c.solicitudCorreccion,
              creadoEn: c.creadoEn.toISOString(),
              revisadoEn: c.revisadoEn?.toISOString() ?? null,
              ruta: `/api/pedidos/${p.codigo}/comprobantes/${c.id}`,
            })),
        }
      : null,
    eventos: p.eventos
      .filter((e) => e.visibilidad === 'CLIENTE')
      .map((e) => ({
        secuencia: e.secuencia,
        tipo: e.tipo,
        titulo: e.titulo,
        descripcion: e.descripcion,
        fecha: e.fecha.toISOString(),
      })),
  };
}

export type RespuestaPedido = ReturnType<typeof respuestaPedido>;
