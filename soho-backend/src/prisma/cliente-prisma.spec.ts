import { obtenerUrlBaseDatos } from './cliente-prisma.js';

describe('Configuracion de MySQL', () => {
  it('conserva los escapes y opciones de una conexion valida', () => {
    const url =
      'mysql://usuario:clave%40de%3Aprueba@127.0.0.1:3307/soho_test?connectionLimit=3';
    expect(obtenerUrlBaseDatos(url)).toBe(url);
  });

  it.each([
    '',
    'texto-invalido',
    'postgresql://usuario:clave@localhost/soho',
    'mysql://usuario:clave@localhost/',
    'mysql://localhost/soho',
    'mysql://usuario:clave@localhost/soho/otra',
    'mysql://usuario:clave@localhost/soho%2Fotra',
    'mysql://usuario:clave@localhost/soho#fragmento',
    'mysql://usuario:clave%ZZ@localhost/soho',
  ])('rechaza una conexion invalida sin incluirla en el error', (url) => {
    expect(() => obtenerUrlBaseDatos(url)).toThrow('Configura DATABASE_URL');
    try {
      obtenerUrlBaseDatos(url);
    } catch (error) {
      expect((error as Error).message).not.toContain('clave');
    }
  });
});
