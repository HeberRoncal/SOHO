import type { PublicarPagos } from './configuracion-pagos';
export const ADMIN_PAGOS = '11111111-1111-4111-8111-111111111111';
export const OTRO_ADMIN_PAGOS = '22222222-2222-4222-8222-222222222222';
export const ID_QR_PAGOS = '33333333-3333-4333-8333-333333333333';
export const CLAVE_PAGOS = '44444444-4444-4444-8444-444444444444';
export function qrPagosFixture(metodo: 'YAPE' | 'PLIN' = 'YAPE', estado = 'DISPONIBLE') {
  return {
    id: ID_QR_PAGOS,
    metodo,
    estado,
    proveedor: 'CLOUDINARY',
    nombre: 'qr.png',
    url:
      estado === 'DISPONIBLE'
        ? 'https://res.cloudinary.com/sintetico/image/upload/v1700000000/soho-qr.png'
        : null,
    cloudName: 'sintetico',
    publicId: 'soho-qr',
    assetId: estado === 'DISPONIBLE' ? 'asset-sintetico' : null,
    versionCloudinary: estado === 'DISPONIBLE' ? '1700000000' : null,
    formato: 'png',
    ancho: 120,
    alto: 120,
    bytes: 200,
    creadoEn: '2026-11-16T12:00:00.000Z',
    revisionEn: estado === 'PENDIENTE' ? '2026-11-16T12:01:00.000Z' : null,
    limpiezaDesde: null,
  };
}
export function configuracionPagosFixture(version = 0) {
  return {
    version,
    actualizadoEn: version ? '2026-11-16T12:00:00.000Z' : null,
    actualizadoPor: version ? { id: ADMIN_PAGOS, nombre: 'Ana Administración' } : null,
    metodos: [
      {
        metodo: 'YAPE',
        activo: version > 0,
        celular: version ? '987654321' : null,
        titular: version ? 'SOHO pruebas' : null,
        qr: null as ReturnType<typeof qrPagosFixture> | null,
      },
      {
        metodo: 'PLIN',
        activo: false,
        celular: null as string | null,
        titular: null as string | null,
        qr: null as ReturnType<typeof qrPagosFixture> | null,
      },
    ],
  };
}
export function consultaPagosFixture(version = 0) {
  return {
    configuracion: configuracionPagosFixture(version),
    capacidades: {
      cargarQr: true,
      maximoBytes: 2097152,
      formatos: ['image/png', 'image/jpeg', 'image/webp'],
      maximoLado: 4096,
    },
  };
}
export function publicacionPagosFixture(cuerpo: PublicarPagos) {
  const configuracion = configuracionPagosFixture(cuerpo.versionEsperada + 1);
  configuracion.metodos = cuerpo.metodos.map((m) => ({
    metodo: m.metodo,
    activo: m.activo,
    celular: m.celular,
    titular: m.titular,
    qr: m.qrId ? { ...qrPagosFixture(m.metodo), id: m.qrId } : null,
  }));
  return { configuracion, modificada: true };
}
export function cuerpoPagosFixture(): PublicarPagos {
  return {
    claveSolicitud: CLAVE_PAGOS,
    versionEsperada: 0,
    confirmado: true,
    metodos: [
      { metodo: 'YAPE', activo: true, celular: '987654321', titular: 'SOHO pruebas', qrId: null },
      { metodo: 'PLIN', activo: false, celular: null, titular: null, qrId: null },
    ],
  };
}
export function archivoPagosFixture(
  nombre = 'qr.png',
  tipo = 'image/png',
  contenido = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3, 4]),
) {
  const f = new File([contenido], nombre, { type: tipo });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => contenido.slice().buffer });
  return f;
}
