import { ConfiguracionCloudinary } from './configuracion-cloudinary.js';

describe('ConfiguracionCloudinary', () => {
  const env = {
    CLOUDINARY_CLOUD_NAME: 'sintetico',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'secreto-sintetico',
  };
  it('permite iniciar el catálogo sin configurar fotografías', () => {
    const c = new ConfiguracionCloudinary({});
    expect(c.habilitada).toBe(false);
    expect(c.procesadorActivo).toBe(false);
    expect(() => c.exigir()).toThrow();
  });
  it('no habilita una configuración parcial o con nombre inseguro', () => {
    for (const cambio of [
      { CLOUDINARY_API_SECRET: '' },
      { CLOUDINARY_CLOUD_NAME: 'otra/ruta' },
      { CLOUDINARY_API_KEY: 'clave inválida' },
    ])
      expect(
        new ConfiguracionCloudinary({ ...env, ...cambio }).habilitada,
      ).toBe(false);
  });
  it('mantiene el procesador desactivado en pruebas y permite apagarlo explícitamente', () => {
    expect(
      new ConfiguracionCloudinary({ ...env, NODE_ENV: 'test' })
        .procesadorActivo,
    ).toBe(false);
    expect(
      new ConfiguracionCloudinary({
        ...env,
        CLOUDINARY_PROCESADOR_ACTIVO: 'false',
      }).procesadorActivo,
    ).toBe(false);
    expect(
      new ConfiguracionCloudinary({ ...env, NODE_ENV: 'production' })
        .procesadorActivo,
    ).toBe(true);
  });
});
