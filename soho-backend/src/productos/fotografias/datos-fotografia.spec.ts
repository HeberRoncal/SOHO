import { DatosFotografia } from './datos-fotografia.js';

describe('DatosFotografia', () => {
  const clave = '113e4567-e89b-42d3-a456-426614174000';
  it('lee exclusivamente la clave y versión del campo datos multipart', () => {
    expect(
      DatosFotografia.carga({
        datos: JSON.stringify({ claveCarga: clave, version: 1 }),
      }),
    ).toEqual({ claveCarga: clave, version: 1 });
    for (const valor of [
      { datos: '{' },
      { datos: '[]' },
      {
        datos: JSON.stringify({
          claveCarga: clave,
          version: 1,
          url: 'https://otra.example',
        }),
      },
      { datos: '{}', archivo: 'no-binario' },
    ])
      expect(() => DatosFotografia.carga(valor)).toThrow();
  });
  it('conserva el orden recibido y normaliza el texto alternativo', () => {
    expect(
      DatosFotografia.galeria({
        claveSolicitud: clave,
        version: 1,
        imagenes: [{ archivoId: clave, textoAlternativo: ' Frontal ' }],
      }).imagenes,
    ).toEqual([{ archivoId: clave, textoAlternativo: 'Frontal' }]);
  });
  it('rechaza archivos duplicados, URL inyectadas y más de diez imágenes', () => {
    const base = { claveSolicitud: clave, version: 1 };
    for (const imagenes of [
      [{ archivoId: clave }, { archivoId: clave }],
      [{ archivoId: clave, ruta: 'https://otra.example' }],
      Array.from({ length: 11 }, (_, i) => ({
        archivoId: `113e4567-e89b-42d3-a456-${String(i).padStart(12, '0')}`,
      })),
    ])
      expect(() => DatosFotografia.galeria({ ...base, imagenes })).toThrow();
  });
  it('admite diez archivos distintos conservando su orden', () => {
    const imagenes = Array.from({ length: 10 }, (_, i) => ({
      archivoId: `113e4567-e89b-42d3-a456-${String(i).padStart(12, '0')}`,
      textoAlternativo: '',
    }));
    expect(
      DatosFotografia.galeria({ claveSolicitud: clave, version: 1, imagenes })
        .imagenes,
    ).toEqual(imagenes);
  });
});
