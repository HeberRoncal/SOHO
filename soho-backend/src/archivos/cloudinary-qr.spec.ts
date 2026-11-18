import { createHash, randomUUID } from 'node:crypto';
import type { ArchivoQrPago } from '../generated/prisma/client.js';
import { CloudinaryService } from '../productos/fotografias/cloudinary.service.js';
import { ConfiguracionCloudinary } from '../productos/fotografias/configuracion-cloudinary.js';
const config = () =>
  new ConfiguracionCloudinary({
    CLOUDINARY_CLOUD_NAME: 'sintetico',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'secreto-sintetico',
    NODE_ENV: 'test',
  });
const contenido = Buffer.from('bytes-sinteticos-qr');
const archivo = () =>
  ({
    id: randomUUID(),
    metodo: 'YAPE',
    proveedor: 'CLOUDINARY',
    cloudName: 'sintetico',
    publicId: 'soho-qr-test',
    carpetaCloudinary: 'SOHO/pagos/yape/prueba',
    nombreOriginal: 'qr.png',
    hashContenido: createHash('sha256').update(contenido).digest('hex'),
    solicitudHash: 'a'.repeat(64),
    formato: 'png',
    ancho: 2,
    alto: 3,
    bytes: contenido.length,
    assetId: 'asset-qr',
    versionCloudinary: 17n,
  }) as ArchivoQrPago;
const recurso = (a = archivo()) => ({
  asset_id: a.assetId,
  public_id: a.publicId,
  resource_type: 'image',
  type: 'upload',
  asset_folder: a.carpetaCloudinary,
  version: 17,
  secure_url:
    'https://res.cloudinary.com/sintetico/image/upload/v17/' +
    a.publicId +
    '.png',
  format: 'png',
  width: a.ancho,
  height: a.alto,
  bytes: a.bytes,
  context: {
    custom: {
      soho_archivo: a.id,
      soho_pago: a.metodo,
      soho_hash: a.hashContenido,
      soho_solicitud: a.solicitudHash,
    },
  },
});
describe('Transporte Cloudinary compartido para QR', () => {
  it.each(['dynamic', 'fixed'] as const)(
    'firma QR y verifica su contenido en modo %s sin contexto de producto',
    async (modo) => {
      const a = archivo();
      if (modo === 'fixed') a.publicId = a.carpetaCloudinary + '/soho-qr-test';
      const r = recurso(a);
      let form: FormData | undefined;
      const http = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input, init) => {
          const url = input instanceof Request ? input.url : input.toString();
          if (url.endsWith('/image/upload')) {
            form = init!.body as FormData;
            return new Response('{}');
          }
          if (url.startsWith('https://res.cloudinary.com/'))
            return new Response(new Uint8Array(contenido));
          return new Response(JSON.stringify(r));
        });
      const c = new CloudinaryService(config(), http);
      await c.subir(a, {
        contenido,
        formato: 'png',
        mime: 'image/png',
        ancho: 2,
        alto: 3,
        hash: a.hashContenido,
        hashOriginal: a.hashContenido,
        nombre: 'qr.png',
      });
      expect(form!.get('overwrite')).toBe('false');
      expect(form!.get('context')).toContain('soho_pago=YAPE');
      expect(form!.get('context')).not.toContain('soho_producto');
      expect(form!.get(modo === 'fixed' ? 'folder' : 'asset_folder')).toBe(
        a.carpetaCloudinary,
      );
      expect(c.verificar(a, r).assetId).toBe(a.assetId);
    },
  );
  it.each([
    'cuenta',
    'producto',
    'billetera',
    'hash',
    'solicitud',
    'archivo',
    'carpeta',
    'public-id',
    'asset',
    'url',
    'ancho',
    'bytes',
    'version',
  ])('rechaza respuesta de proveedor incompatible %s', (caso) => {
    const a = archivo(),
      r = recurso(a);
    if (caso === 'cuenta') a.cloudName = 'otra';
    if (caso === 'producto')
      (r.context.custom as Record<string, string>).soho_producto = randomUUID();
    if (caso === 'billetera') r.context.custom.soho_pago = 'PLIN';
    if (caso === 'hash') r.context.custom.soho_hash = 'b'.repeat(64);
    if (caso === 'solicitud') r.context.custom.soho_solicitud = 'b'.repeat(64);
    if (caso === 'archivo') r.context.custom.soho_archivo = randomUUID();
    if (caso === 'carpeta') r.asset_folder = 'SOHO/productos';
    if (caso === 'public-id') r.public_id = 'otro';
    if (caso === 'asset') r.asset_id = '';
    if (caso === 'url') r.secure_url = 'https://ajeno.test/qr.png';
    if (caso === 'ancho') r.width = 4097;
    if (caso === 'bytes') r.bytes = 2097153;
    if (caso === 'version') r.version = 0;
    expect(() => new CloudinaryService(config()).verificar(a, r)).toThrow();
  });
  it('rechaza contenido que no coincide con el hash del recurso reservado', async () => {
    const a = archivo(),
      r = recurso(a),
      http = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input) =>
          (input instanceof Request ? input.url : input.toString()).startsWith(
            'https://res.cloudinary.com/',
          )
            ? new Response(new Uint8Array(Buffer.alloc(contenido.length)))
            : new Response(JSON.stringify(r)),
        );
    await expect(
      new CloudinaryService(config(), http).buscar(a),
    ).rejects.toThrow();
  });
});
