import { randomUUID } from 'node:crypto';
import { DatosPagos } from './datos-pagos.js';
const valido = () => ({
  claveSolicitud: randomUUID() as string,
  versionEsperada: 0,
  confirmado: true,
  metodos: [
    {
      metodo: 'YAPE',
      activo: true,
      celular: '987654321',
      titular: 'SOHO',
      qrId: null,
    },
    { metodo: 'PLIN', activo: false, celular: null, titular: null, qrId: null },
  ],
});
describe('Contratos de configuración de pagos', () => {
  it('normaliza UUID y orden de métodos', () => {
    const d = valido();
    d.claveSolicitud = d.claveSolicitud.toUpperCase();
    d.metodos.reverse();
    expect(DatosPagos.guardar(d).metodos[0].metodo).toBe('YAPE');
    expect(DatosPagos.guardar(d).claveSolicitud).toBe(
      d.claveSolicitud.toLowerCase(),
    );
  });
  it.each([undefined, null, [], {}, '{}'])(
    'rechaza cuerpo incompleto %s',
    (v) => {
      expect(() => DatosPagos.guardar(v)).toThrow();
    },
  );
  it.each(['\u0000', '\n', '\u200b', 'a'.repeat(121)])(
    'rechaza titular con control o exceso %s',
    (t) => {
      const d = valido();
      d.metodos[0].titular = t;
      expect(() => DatosPagos.guardar(d)).toThrow();
    },
  );
  it.each([
    '888888888',
    '+51987654321',
    '98765432',
    '9876543210',
    '9abcdefghi',
  ])('rechaza celular %s', (t) => {
    const d = valido();
    d.metodos[0].celular = t;
    expect(() => DatosPagos.guardar(d)).toThrow();
  });
  it.each([undefined, '[]', '{', '{"claveCarga":"x","metodo":"YAPE"}'])(
    'rechaza carga inválida %s',
    (datos) => {
      expect(() => DatosPagos.carga({ datos })).toThrow();
    },
  );
  it('carga exige campo datos único y sin URL ni base64', () => {
    expect(() =>
      DatosPagos.carga({ datos: '{}', url: 'https://ajeno.test' }),
    ).toThrow();
    expect(() =>
      DatosPagos.carga({
        datos: JSON.stringify({
          claveCarga: randomUUID(),
          metodo: 'YAPE',
          base64: 'abc',
        }),
      }),
    ).toThrow();
  });
});
