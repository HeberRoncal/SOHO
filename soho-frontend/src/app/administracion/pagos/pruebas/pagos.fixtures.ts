import { PEDIDOS_ADMIN_DEMO } from '../../cambios/datos/pedidos-posventa-demo';
import { ComprobanteAdmin, RegistroPagoAdmin } from '../modelos/pago-admin';

// Documentos de interfaz ficticios: no son capturas ni transferencias reales.
export const PAGOS_ADMIN_DEMO: readonly RegistroPagoAdmin[] = Object.freeze(
  PEDIDOS_ADMIN_DEMO.map((p) => {
    if (!p.comprobante)
      return Object.freeze({
        codigo: p.codigo,
        comprobantes: Object.freeze([]),
        modificado: false,
        eventos: Object.freeze([]),
      });
    const corregido = p.codigo === 'SOHO-000127';
    const actual: ComprobanteAdmin = Object.freeze({
      id: p.codigo + (corregido ? '-v2' : '-v1'),
      nombre: p.comprobante,
      fecha: new Date(Date.parse(p.fecha) + 5 * 60000).toISOString(),
      estado: p.estadoPago,
      monto:
        p.estadoPago === 'observado'
          ? null
          : p.codigo === 'SOHO-000127' || p.estadoPago === 'rechazado'
            ? (Math.round(p.total * 100) - 1000) / 100
            : p.total,
      operacion: p.operacion,
      ...(corregido ? { corregido: true } : {}),
      ...(['observado', 'rechazado'].includes(p.estadoPago)
        ? {
            mensaje: p.observacion,
            motivo: p.estadoPago === 'observado' ? 'ilegible' : 'monto',
            solicitud: 'legible' as const,
          }
        : {}),
      ...(['aprobado', 'observado', 'rechazado'].includes(p.estadoPago)
        ? {
            revisadoEn: new Date(Date.parse(p.fecha) + 20 * 60000).toISOString(),
            revisadoPor: 'Admin Demo',
          }
        : {}),
    });
    const anteriores: readonly ComprobanteAdmin[] = corregido
      ? [
          Object.freeze({
            id: p.codigo + '-v1',
            nombre: 'comprobante-demo-127-anterior.png',
            fecha: new Date(Date.parse(p.fecha) + 60000).toISOString(),
            estado: 'observado' as const,
            monto: null,
            operacion: p.operacion,
            motivo: 'ilegible',
            mensaje: 'Adjunta una captura legible y completa del comprobante.',
            solicitud: 'legible' as const,
            revisadoEn: new Date(Date.parse(p.fecha) + 2 * 60000).toISOString(),
            revisadoPor: 'Admin Demo',
          }),
        ]
      : [];
    return Object.freeze({
      codigo: p.codigo,
      comprobantes: Object.freeze([actual, ...anteriores]),
      modificado: false,
      eventos: Object.freeze([]),
    });
  }),
);
