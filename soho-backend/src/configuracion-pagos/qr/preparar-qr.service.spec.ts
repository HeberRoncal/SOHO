import sharp from 'sharp';
import { PrepararQrService } from './preparar-qr.service.js';
describe('Preparación de QR sin pérdida', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodifica %s sin recortar y entrega PNG',
    async (formato) => {
      const buffer = await sharp({
        create: { width: 75, height: 50, channels: 3, background: '#fff' },
      })
        .toFormat(formato)
        .toBuffer();
      const r = await new PrepararQrService().preparar({
        buffer,
        mimetype: 'image/' + formato,
        originalname: 'qr.' + formato,
      });
      expect(r).toMatchObject({
        ancho: 75,
        alto: 50,
        formato: 'png',
        mime: 'image/png',
      });
      expect(await sharp(r.contenido).raw().toBuffer()).toEqual(
        await sharp(buffer).raw().toBuffer(),
      );
    },
  );
  it('conserva exactamente el patrón y el margen de una imagen de módulos', async () => {
    const w = 96,
      pixeles = Buffer.alloc(w * w * 3, 255);
    for (let y = 16; y < 80; y++)
      for (let x = 16; x < 80; x++)
        if ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0)
          pixeles.fill(0, (y * w + x) * 3, (y * w + x) * 3 + 3);
    const buffer = await sharp(pixeles, {
      raw: { width: w, height: w, channels: 3 },
    })
      .png()
      .toBuffer();
    const r = await new PrepararQrService().preparar({
      buffer,
      mimetype: 'image/png',
      originalname: 'qr.png',
    });
    expect(await sharp(r.contenido).raw().toBuffer()).toEqual(pixeles);
  });
  it('rechaza WebP animado', async () => {
    const pixeles = Buffer.alloc(4 * 8 * 3);
    pixeles.fill(255, 4 * 4 * 3);
    const buffer = await sharp(pixeles, {
      raw: { width: 4, height: 8, channels: 3, pageHeight: 4 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(buffer).metadata()).pages).toBe(2);
    await expect(
      new PrepararQrService().preparar({
        buffer,
        mimetype: 'image/webp',
        originalname: 'animado.webp',
      }),
    ).rejects.toThrow();
  });
  it('orienta sin recortar y retira metadatos', async () => {
    const buffer = await sharp({
      create: { width: 8, height: 4, channels: 3, background: '#fff' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = await new PrepararQrService().preparar({
      buffer,
      mimetype: 'image/jpeg',
      originalname: 'qr.jpg',
    });
    expect(r).toMatchObject({ ancho: 4, alto: 8 });
    expect((await sharp(r.contenido).metadata()).exif).toBeUndefined();
  });
  it('rechaza SVG o archivo ausente', async () => {
    for (const a of [
      undefined,
      {
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        mimetype: 'image/svg+xml',
        originalname: 'qr.svg',
      },
    ])
      await expect(new PrepararQrService().preparar(a)).rejects.toThrow();
  });
});
