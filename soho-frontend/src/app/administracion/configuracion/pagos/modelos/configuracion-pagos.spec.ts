import {
  archivoQrPago,
  consultaPagos,
  configuracionPagos,
  crearPublicacionPagos,
  borradorPagos,
  publicacionPagosGuardada,
  respuestaPublicacionPagos,
  datosCargaQrGuardada,
  describirArchivoQr,
  respuestaCargaQr,
} from './configuracion-pagos';
import {
  ID_QR_PAGOS,
  CLAVE_PAGOS,
  qrPagosFixture,
  configuracionPagosFixture,
  consultaPagosFixture,
  cuerpoPagosFixture,
  publicacionPagosFixture,
  archivoPagosFixture,
} from './configuracion-pagos.fixtures';
describe('Contratos de Configuración Pagos', () => {
  it('representa versión cero desactivada sin datos ficticios', () => {
    const c = consultaPagos(consultaPagosFixture());
    expect(c.configuracion.metodos.every((m) => !m.activo && !m.celular && !m.qr)).toBe(true);
    expect(c.configuracion.actualizadoPor).toBeNull();
  });
  it('rechaza una versión cero con datos o responsable', () => {
    const c = configuracionPagosFixture();
    c.metodos[0].celular = '987654321';
    expect(() => configuracionPagos(c)).toThrow();
  });
  it.each(['YAPE', 'PLIN'])('exige dos métodos distintos: %s', (metodo) => {
    const c = configuracionPagosFixture();
    c.metodos.forEach((m) => (m.metodo = metodo));
    expect(() => configuracionPagos(c)).toThrow();
  });
  it('exige datos receptores válidos si el método está activo', () => {
    const c = configuracionPagosFixture(1);
    c.metodos[0].titular = null;
    expect(() => configuracionPagos(c)).toThrow();
  });
  it('no permite un QR de otra billetera ni una carga pendiente publicada', () => {
    const c = configuracionPagosFixture(1);
    c.metodos[0].qr = qrPagosFixture('PLIN');
    expect(() => configuracionPagos(c)).toThrow();
    c.metodos[0].qr = qrPagosFixture('YAPE', 'PENDIENTE');
    expect(() => configuracionPagos(c)).toThrow();
  });
  it.each([
    'http://res.cloudinary.com/sintetico/image/upload/v1700000000/soho-qr.png',
    'https://otro.test/imagen.png',
    'https://res.cloudinary.com/sintetico/image/upload/v2/soho-qr.png',
    'https://res.cloudinary.com/sintetico/image/upload/v1700000000/soho-qr.png?token=abc',
  ])('rechaza una URL QR no verificable: %s', (url) => {
    expect(() => archivoQrPago({ ...qrPagosFixture(), url })).toThrow();
  });
  it('rechaza un SVG o una imagen con dimensiones excesivas', () => {
    expect(() => archivoQrPago({ ...qrPagosFixture(), formato: 'svg' })).toThrow();
    expect(() => archivoQrPago({ ...qrPagosFixture(), ancho: 4097 })).toThrow();
  });
  it('normaliza teléfono y titular al guardar sin publicar el borrador directamente', () => {
    const b = borradorPagos(configuracionPagos(configuracionPagosFixture()));
    b[0].activo = true;
    b[0].celular = '987 654 321';
    b[0].titular = '  SOHO pruebas  ';
    const d = crearPublicacionPagos(b, 0);
    expect(d.metodos[0].celular).toBe('987654321');
    expect(d.metodos[0].titular).toBe('SOHO pruebas');
    expect(Object.isFrozen(d.metodos[0])).toBe(true);
    expect(b[0].titular).toContain('  ');
  });
  it('rechaza texto invisible, cambios sin confirmar y campos desconocidos guardados', () => {
    const c = cuerpoPagosFixture();
    expect(() => publicacionPagosGuardada({ ...c, confirmado: false })).toThrow();
    expect(() => publicacionPagosGuardada({ ...c, ruta: '/otra' })).toThrow();
    c.metodos[0].titular = 'SOHO\nPrueba';
    expect(() => publicacionPagosGuardada(c)).toThrow();
  });
  it('valida que la respuesta pertenezca al contenido y versión originales', () => {
    const c = cuerpoPagosFixture(),
      r = publicacionPagosFixture(c);
    expect(respuestaPublicacionPagos(r, c).version).toBe(1);
    r.configuracion.version = 2;
    expect(() => respuestaPublicacionPagos(r, c)).toThrow();
    r.configuracion.version = 1;
    r.configuracion.metodos[0].celular = '999999999';
    expect(() => respuestaPublicacionPagos(r, c)).toThrow();
  });
  it('limita las capacidades de carga al contrato vigente', () => {
    const c = consultaPagosFixture();
    c.capacidades.formatos.push('image/svg+xml');
    expect(() => consultaPagos(c)).toThrow();
  });
  it('guarda la identidad del archivo sin almacenar sus bytes', async () => {
    const d = await describirArchivoQr(archivoPagosFixture(), 'YAPE', CLAVE_PAGOS);
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.nombre).toBe('qr.png');
    expect(d.archivoId).toBeNull();
    expect(Object.keys(d)).not.toContain('contenido');
  });
  it.each(['image/svg+xml', 'application/pdf', ''])(
    'no admite el tipo original %s',
    async (tipo) => {
      await expect(describirArchivoQr(archivoPagosFixture('qr', tipo), 'YAPE')).rejects.toThrow();
    },
  );
  it('rechaza una carga restaurada con otra ruta o hash inválido', () => {
    const d = {
      claveCarga: CLAVE_PAGOS,
      metodo: 'YAPE',
      nombre: 'qr.png',
      tipo: 'image/png',
      tamano: 20,
      sha256: 'a'.repeat(64),
      archivoId: null,
    };
    expect(datosCargaQrGuardada(d).metodo).toBe('YAPE');
    expect(() => datosCargaQrGuardada({ ...d, sha256: 'secreto' })).toThrow();
    expect(() => datosCargaQrGuardada({ ...d, ruta: '/api/otra' })).toThrow();
  });
  it('no cambia de archivo o billetera en una carga recuperada', () => {
    const datos = {
      claveCarga: CLAVE_PAGOS,
      metodo: 'YAPE' as const,
      nombre: 'qr.png',
      tipo: 'image/png',
      tamano: 20,
      sha256: 'a'.repeat(64),
      archivoId: ID_QR_PAGOS,
    };
    expect(() => respuestaCargaQr({ archivo: qrPagosFixture('PLIN') }, datos)).toThrow();
    expect(() =>
      respuestaCargaQr({ archivo: { ...qrPagosFixture(), id: CLAVE_PAGOS } }, datos),
    ).toThrow();
  });
});
