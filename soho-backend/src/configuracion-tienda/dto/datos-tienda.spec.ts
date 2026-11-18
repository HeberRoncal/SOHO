import { DatosTienda } from './datos-tienda.js';
const base = () => ({
  claveSolicitud: '11111111-1111-4111-8111-111111111111',
  versionEsperada: 0,
  tienda: {
    correo: ' CONTACTO@SOHO.TEST ',
    whatsapp: '987 654 321',
    horario: 'Lunes a sábado',
    enlaces: [
      { texto: 'Ayuda', url: 'https://soho.test/ayuda' },
      { texto: '', url: null },
    ],
    politicas: {
      cambios: 'Cambios\nSegunda línea',
      privacidad: null,
      terminos: null,
    },
  },
});
describe('Datos de Tienda', () => {
  it('normaliza contactos y conserva políticas multilínea', () => {
    const d = DatosTienda.guardar(base());
    expect(d.tienda.correo).toBe('contacto@soho.test');
    expect(d.tienda.whatsapp).toBe('987654321');
    expect(d.tienda.politicas.cambios).toBe('Cambios\nSegunda línea');
  });
  it.each([
    'javascript:alert(1)',
    'https://usuario:clave@soho.test',
    'https://soho.test/a b',
    '//soho.test',
  ])('rechaza URL insegura %s', (url) => {
    const d = base();
    d.tienda.enlaces[0].url = url;
    expect(() => DatosTienda.guardar(d)).toThrow();
  });
  it('acepta políticas completas de 10000 caracteres y rechaza exceso', () => {
    const d = base();
    d.tienda.politicas.cambios = 'á'.repeat(10000);
    expect(DatosTienda.guardar(d).tienda.politicas.cambios).toHaveLength(10000);
    d.tienda.politicas.cambios += 'a';
    expect(() => DatosTienda.guardar(d)).toThrow();
  });
  it.each([-1, 0.5, 4294967295])(
    'rechaza versión inválida %s',
    (versionEsperada) => {
      expect(() =>
        DatosTienda.guardar({ ...base(), versionEsperada }),
      ).toThrow();
    },
  );
  it('rechaza controles y campos extra', () => {
    expect(() => DatosTienda.guardar({ ...base(), rol: 'ADMIN' })).toThrow();
    const d = base();
    d.tienda.horario = 'A\u0000B';
    expect(() => DatosTienda.guardar(d)).toThrow();
  });
});
