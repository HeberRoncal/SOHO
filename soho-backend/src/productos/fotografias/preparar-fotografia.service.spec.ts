import { PrepararFotografiaService } from './preparar-fotografia.service.js';
import sharp from 'sharp';
describe('Preparación de fotografías reales', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodifica y recodifica %s',
    async (formato) => {
      const buffer = await sharp({
        create: { width: 3, height: 2, channels: 3, background: '#ffffff' },
      })
        .toFormat(formato)
        .toBuffer();
      const r = await new PrepararFotografiaService().preparar({
        buffer,
        mimetype: 'image/' + formato,
        originalname: 'frontal.' + formato,
      });
      expect(r).toMatchObject({ ancho: 3, alto: 2, mime: 'image/' + formato });
      expect(r.hash).toMatch(/^[a-f0-9]{64}$/);
      expect((await sharp(r.contenido).metadata()).format).toBe(formato);
    },
  );
  it('admite AVIF real y lo prepara como WebP sin metadatos', async () => {
    const buffer = await sharp({
      create: { width: 3, height: 2, channels: 4, background: '#ffffff80' },
    })
      .avif()
      .toBuffer();
    const servicio = new PrepararFotografiaService();
    const r = await servicio.preparar({
      buffer,
      mimetype: 'image/avif',
      originalname: 'frontal.avif',
    });
    expect(r).toMatchObject({
      ancho: 3,
      alto: 2,
      formato: 'webp',
      mime: 'image/webp',
    });
    expect((await sharp(r.contenido).metadata()).format).toBe('webp');
    await expect(
      servicio.preparar({
        buffer,
        mimetype: 'image/png',
        originalname: 'falso.png',
      }),
    ).rejects.toThrow();
    const png = await sharp(buffer).png().toBuffer();
    await expect(
      servicio.preparar({
        buffer: png,
        mimetype: 'image/avif',
        originalname: 'falso.avif',
      }),
    ).rejects.toThrow();
  });
  it('aplica orientación y elimina los metadatos originales', async () => {
    const buffer = await sharp({
      create: { width: 3, height: 2, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = await new PrepararFotografiaService().preparar({
      buffer,
      mimetype: 'image/jpeg',
      originalname: 'frontal.jpg',
    });
    expect(r).toMatchObject({ ancho: 2, alto: 3 });
    expect((await sharp(r.contenido).metadata()).orientation).toBeUndefined();
  });
  it('rechaza SVG, MIME falso, archivo ausente y exceso de tamaño', async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    for (const fichero of [
      undefined,
      {
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        mimetype: 'image/svg+xml',
        originalname: 'foto.svg',
      },
      { buffer: png, mimetype: 'image/jpeg', originalname: 'foto.jpg' },
      {
        buffer: Buffer.alloc(5242881),
        mimetype: 'image/png',
        originalname: 'foto.png',
      },
    ])
      await expect(
        new PrepararFotografiaService().preparar(fichero),
      ).rejects.toThrow();
  });
  it('limita dimensiones aunque el archivo comprimido sea pequeño', async () => {
    const buffer = await sharp({
      create: { width: 8193, height: 1, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await expect(
      new PrepararFotografiaService().preparar({
        buffer,
        mimetype: 'image/png',
        originalname: 'ancha.png',
      }),
    ).rejects.toThrow();
  });
});
