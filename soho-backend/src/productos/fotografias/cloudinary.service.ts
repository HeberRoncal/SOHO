import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RecursoCloudinary } from '../../archivos/recurso-cloudinary.interface.js';
import {
  ConfiguracionCloudinary,
  HTTP_CLOUDINARY,
  MAXIMO_FOTOGRAFIA,
} from './configuracion-cloudinary.js';

export type ModoCarpetas = 'dynamic' | 'fixed';
export interface FotografiaPreparada {
  contenido: Buffer;
  formato: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  ancho: number;
  alto: number;
  hash: string;
  hashOriginal: string;
  nombre: string;
}
export interface ArchivoComprobanteCloudinary {
  contenido: Buffer;
  formato: string;
  sha256: string;
  tamanoBytes: number;
}
const fallo = () =>
  new ServiceUnavailableException(
    'Cloudinary no pudo confirmar la operación. Reintenta la consulta más adelante.',
  );
function registro(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw fallo();
  return v as Record<string, unknown>;
}
function entero(v: unknown, maximo: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1 || v > maximo)
    throw fallo();
  return v;
}

@Injectable()
export class CloudinaryService {
  private readonly http: typeof fetch;
  private modo?: { valor: ModoCarpetas; hasta: number };
  constructor(
    @Inject(ConfiguracionCloudinary) readonly config: ConfiguracionCloudinary,
    @Optional() @Inject(HTTP_CLOUDINARY) http?: typeof fetch,
  ) {
    this.http = http ?? fetch;
  }

  private async solicitar(
    ruta: string,
    init: RequestInit = {},
    faltaPermitida = false,
  ): Promise<Record<string, unknown> | null> {
    this.config.exigir();
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', this.config.autorizacion());
      const response = await this.http(
        'https://api.cloudinary.com/v1_1/' +
          encodeURIComponent(this.config.cloudName) +
          '/' +
          ruta,
        {
          ...init,
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.status === 404 && faltaPermitida) return null;
      if (!response.ok) throw fallo();
      const texto = await response.text();
      if (texto.length > 256_000) throw fallo();
      return registro(JSON.parse(texto));
    } catch {
      throw fallo();
    }
  }

  async modoCarpetas(): Promise<ModoCarpetas> {
    if (this.modo && this.modo.hasta > Date.now()) return this.modo.valor;
    const data = registro(await this.solicitar('config?settings=true'));
    const modo = registro(data.settings).folder_mode;
    if (modo !== 'dynamic' && modo !== 'fixed') throw fallo();
    this.modo = { valor: modo, hasta: Date.now() + 300_000 };
    return modo;
  }

  async subir(
    archivo: RecursoCloudinary,
    foto: FotografiaPreparada,
  ): Promise<unknown> {
    this.comprobarCuenta(archivo);
    const dinamico = !archivo.publicId!.includes('/');
    const parametros: Record<string, string> = {
      public_id: dinamico
        ? archivo.publicId!
        : archivo.publicId!.slice(archivo.carpetaCloudinary!.length + 1),
      timestamp: String(Math.floor(Date.now() / 1000)),
      overwrite: 'false',
      unique_filename: 'false',
      type: 'upload',
      context: `soho_archivo=${archivo.id}|${'productoOrigenId' in archivo ? 'soho_producto=' + archivo.productoOrigenId : 'soho_pago=' + archivo.metodo}|soho_hash=${archivo.hashContenido}|soho_solicitud=${archivo.solicitudHash}`,
    };
    if (dinamico) {
      parametros.asset_folder = archivo.carpetaCloudinary!;
      parametros.display_name = archivo.nombreOriginal!;
      parametros.use_asset_folder_as_public_id_prefix = 'false';
    } else parametros.folder = archivo.carpetaCloudinary!;
    const body = new FormData();
    for (const [k, v] of Object.entries(
      this.config.autenticarFormulario(parametros),
    ))
      body.set(k, v);
    body.set(
      'file',
      new Blob([new Uint8Array(foto.contenido)], { type: foto.mime }),
      'fotografia.' + foto.formato,
    );
    // Una respuesta existing:true también se verifica por Admin API, con contexto.
    await this.solicitar('image/upload', { method: 'POST', body });
    const recurso = await this.buscar(archivo);
    if (!recurso) throw fallo();
    return recurso;
  }

  private validarIdComprobante(id: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    )
      throw fallo();
  }

  private async buscarRecursoComprobante(
    id: string,
  ): Promise<Record<string, unknown> | null> {
    this.config.exigir();
    this.validarIdComprobante(id);
    for (const publicId of [id, `SOHO/comprobantes/${id}`]) {
      const recurso = await this.solicitar(
        'resources/image/authenticated/' +
          publicId.split('/').map(encodeURIComponent).join('/') +
          '?context=true',
        {},
        true,
      );
      if (recurso) return recurso;
    }
    return null;
  }

  private verificarComprobante(
    id: string,
    respuesta: unknown,
    esperado?: Pick<
      ArchivoComprobanteCloudinary,
      'formato' | 'sha256' | 'tamanoBytes'
    >,
  ) {
    this.validarIdComprobante(id);
    const r = registro(respuesta),
      contexto = registro(registro(r.context).custom),
      publicId =
        r.public_id === id
          ? id
          : r.public_id === `SOHO/comprobantes/${id}`
            ? `SOHO/comprobantes/${id}`
            : null,
      assetId = r.asset_id,
      formato = r.format === 'jpeg' ? 'jpg' : r.format,
      mime =
        formato === 'jpg'
          ? 'image/jpeg'
          : formato === 'png'
            ? 'image/png'
            : formato === 'webp'
              ? 'image/webp'
              : null;
    if (
      r.resource_type !== 'image' ||
      r.type !== 'authenticated' ||
      !publicId ||
      (r.asset_folder ?? r.folder) !== 'SOHO/comprobantes' ||
      contexto.soho_comprobante !== id ||
      typeof contexto.soho_hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(contexto.soho_hash) ||
      typeof contexto.soho_formato !== 'string' ||
      !mime ||
      typeof assetId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(assetId)
    )
      throw fallo();
    const bytes = entero(r.bytes, MAXIMO_FOTOGRAFIA),
      version = entero(r.version, Number.MAX_SAFE_INTEGER),
      ancho = entero(r.width, 8192),
      alto = entero(r.height, 8192);
    if (
      ancho * alto > 20_000_000 ||
      contexto.soho_bytes !== String(bytes) ||
      (esperado &&
        (contexto.soho_hash !== esperado.sha256 ||
          contexto.soho_formato !== esperado.formato ||
          bytes !== esperado.tamanoBytes ||
          mime !== esperado.formato))
    )
      throw fallo();
    return { assetId, publicId, version, bytes, mime };
  }

  async guardarComprobante(
    id: string,
    archivo: ArchivoComprobanteCloudinary,
  ): Promise<void> {
    this.config.exigir();
    this.validarIdComprobante(id);
    if (
      archivo.contenido.length !== archivo.tamanoBytes ||
      archivo.tamanoBytes < 1 ||
      archivo.tamanoBytes > MAXIMO_FOTOGRAFIA ||
      createHash('sha256').update(archivo.contenido).digest('hex') !==
        archivo.sha256 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(archivo.formato)
    )
      throw fallo();
    const previo = await this.buscarRecursoComprobante(id);
    if (previo) {
      this.verificarComprobante(id, previo, archivo);
      return;
    }
    const dinamico = (await this.modoCarpetas()) === 'dynamic',
      parametros: Record<string, string> = {
        public_id: id,
        timestamp: String(Math.floor(Date.now() / 1000)),
        overwrite: 'false',
        unique_filename: 'false',
        type: 'authenticated',
        context: [
          `soho_comprobante=${id}`,
          `soho_hash=${archivo.sha256}`,
          `soho_formato=${archivo.formato}`,
          `soho_bytes=${archivo.tamanoBytes}`,
        ].join('|'),
      };
    if (dinamico) {
      parametros.asset_folder = 'SOHO/comprobantes';
      parametros.display_name = `comprobante-${id}`;
      parametros.use_asset_folder_as_public_id_prefix = 'false';
    } else parametros.folder = 'SOHO/comprobantes';
    const body = new FormData();
    for (const [k, v] of Object.entries(
      this.config.autenticarFormulario(parametros),
    ))
      body.set(k, v);
    body.set(
      'file',
      new Blob([new Uint8Array(archivo.contenido)], {
        type: archivo.formato,
      }),
      `comprobante.${archivo.formato === 'image/jpeg' ? 'jpg' : archivo.formato.split('/')[1]}`,
    );
    try {
      await this.solicitar('image/upload', { method: 'POST', body });
    } catch {
      const existente = await this.buscarRecursoComprobante(id);
      if (!existente) throw fallo();
      this.verificarComprobante(id, existente, archivo);
      return;
    }
    const recurso = await this.buscarRecursoComprobante(id);
    if (!recurso) throw fallo();
    this.verificarComprobante(id, recurso, archivo);
  }

  async comprobarComprobante(
    id: string,
    esperado: Pick<
      ArchivoComprobanteCloudinary,
      'formato' | 'sha256' | 'tamanoBytes'
    >,
  ): Promise<boolean> {
    const recurso = await this.buscarRecursoComprobante(id);
    if (!recurso) return false;
    this.verificarComprobante(id, recurso, esperado);
    return true;
  }

  private async descargarComprobante(
    url: string,
  ): Promise<{ contenido: Buffer; formato: string }> {
    let lector: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await this.http(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok || !response.body) throw fallo();
      const formato = response.headers
        .get('content-type')
        ?.split(';', 1)[0]
        .trim();
      lector = response.body.getReader();
      const partes: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const parte = await lector.read();
        if (parte.done) break;
        total += parte.value.byteLength;
        if (total > MAXIMO_FOTOGRAFIA) throw fallo();
        partes.push(parte.value);
      }
      return {
        contenido: Buffer.concat(partes, total),
        formato: formato ?? '',
      };
    } catch {
      throw fallo();
    } finally {
      await lector?.cancel().catch(() => undefined);
    }
  }

  async leerComprobante(
    id: string,
    esperado: Pick<
      ArchivoComprobanteCloudinary,
      'formato' | 'sha256' | 'tamanoBytes'
    >,
  ): Promise<Buffer> {
    const recurso = await this.buscarRecursoComprobante(id);
    if (!recurso) throw fallo();
    const meta = this.verificarComprobante(id, recurso, esperado),
      entrega = await this.descargarComprobante(
        this.config.urlAutenticada(meta.publicId, meta.version),
      );
    if (
      entrega.contenido.length !== esperado.tamanoBytes ||
      entrega.formato !== esperado.formato ||
      createHash('sha256').update(entrega.contenido).digest('hex') !==
        esperado.sha256
    )
      throw fallo();
    return entrega.contenido;
  }

  async leerComprobanteOptimizado(
    id: string,
    esperado: Pick<
      ArchivoComprobanteCloudinary,
      'formato' | 'sha256' | 'tamanoBytes'
    >,
  ): Promise<Buffer> {
    const recurso = await this.buscarRecursoComprobante(id);
    if (!recurso) throw fallo();
    const meta = this.verificarComprobante(id, recurso, esperado),
      entrega = await this.descargarComprobante(
        this.config.urlAutenticada(meta.publicId, meta.version, true),
      );
    if (entrega.formato !== 'image/webp' || !entrega.contenido.length)
      throw fallo();
    return entrega.contenido;
  }

  async eliminarComprobante(id: string): Promise<void> {
    const recurso = await this.buscarRecursoComprobante(id);
    if (!recurso) return;
    const meta = this.verificarComprobante(id, recurso),
      body = new URLSearchParams();
    body.append('asset_ids[]', meta.assetId);
    await this.solicitar('resources', { method: 'DELETE', body });
    if (await this.buscarRecursoComprobante(id)) throw fallo();
  }

  comprobarCuenta(archivo: RecursoCloudinary) {
    this.config.exigir();
    if (
      archivo.cloudName !== this.config.cloudName ||
      archivo.proveedor !== 'CLOUDINARY'
    )
      throw fallo();
  }
  async buscar(
    archivo: RecursoCloudinary,
  ): Promise<Record<string, unknown> | null> {
    this.comprobarCuenta(archivo);
    const recurso = await this.solicitar(
      'resources/image/upload/' +
        encodeURIComponent(archivo.publicId!) +
        '?context=true',
      {},
      true,
    );
    if (recurso) await this.verificarContenido(archivo, recurso);
    return recurso;
  }
  buscarPorAsset(
    archivo: RecursoCloudinary,
  ): Promise<Record<string, unknown> | null> {
    this.comprobarCuenta(archivo);
    if (!archivo.assetId) throw fallo();
    return this.solicitar(
      'resources/' + encodeURIComponent(archivo.assetId) + '?context=true',
      {},
      true,
    );
  }

  verificar(archivo: RecursoCloudinary, respuesta: unknown) {
    this.comprobarCuenta(archivo);
    const r = registro(respuesta),
      contexto = registro(registro(r.context).custom);
    if (
      r.public_id !== archivo.publicId ||
      r.resource_type !== 'image' ||
      r.type !== 'upload' ||
      contexto.soho_archivo !== archivo.id ||
      ('productoOrigenId' in archivo
        ? contexto.soho_producto !== archivo.productoOrigenId ||
          contexto.soho_pago !== undefined
        : contexto.soho_pago !== archivo.metodo ||
          contexto.soho_producto !== undefined) ||
      contexto.soho_hash !== archivo.hashContenido ||
      contexto.soho_solicitud !== archivo.solicitudHash ||
      (r.asset_folder ?? r.folder) !== archivo.carpetaCloudinary ||
      typeof r.asset_id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(r.asset_id) ||
      !['jpg', 'jpeg', 'png', 'webp'].includes(r.format as string)
    )
      throw fallo();
    const qr = !('productoOrigenId' in archivo);
    const ancho = entero(r.width, qr ? 4096 : 8192),
      alto = entero(r.height, qr ? 4096 : 8192),
      bytes = entero(r.bytes, qr ? 2 * 1024 * 1024 : MAXIMO_FOTOGRAFIA),
      version = entero(r.version, Number.MAX_SAFE_INTEGER);
    const formato =
      r.format === 'jpeg' ? 'jpg' : (r.format as 'jpg' | 'png' | 'webp');
    if (
      ancho * alto > 20_000_000 ||
      ancho !== archivo.ancho ||
      alto !== archivo.alto ||
      bytes !== archivo.bytes ||
      formato !== archivo.formato
    )
      throw fallo();
    if (typeof r.secure_url !== 'string' || r.secure_url.length > 1024)
      throw fallo();
    const url = new URL(r.secure_url);
    const ruta =
      '/' +
      encodeURIComponent(this.config.cloudName) +
      '/image/upload/v' +
      version +
      '/' +
      archivo.publicId!.split('/').map(encodeURIComponent).join('/') +
      '.' +
      r.format;
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== ruta
    )
      throw fallo();
    return {
      assetId: r.asset_id,
      versionCloudinary: BigInt(version),
      urlEntrega: r.secure_url,
      formato,
      ancho,
      alto,
      bytes,
    };
  }

  private async verificarContenido(
    archivo: RecursoCloudinary,
    respuesta: unknown,
  ) {
    const meta = this.verificar(archivo, respuesta);
    try {
      const response = await this.http(meta.urlEntrega, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || !response.body) throw fallo();
      const reader = response.body.getReader(),
        hash = createHash('sha256');
      let bytes = 0;
      try {
        while (true) {
          const parte = await reader.read();
          if (parte.done) break;
          bytes += parte.value.byteLength;
          if (bytes > MAXIMO_FOTOGRAFIA || bytes > meta.bytes) throw fallo();
          hash.update(parte.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      if (bytes !== meta.bytes || hash.digest('hex') !== archivo.hashContenido)
        throw fallo();
    } catch {
      throw fallo();
    }
  }

  async eliminar(archivo: RecursoCloudinary): Promise<void> {
    const antes = await this.buscarPorAsset(archivo);
    if (!antes) return;
    const verificado = this.verificar(archivo, antes);
    if (
      verificado.assetId !== archivo.assetId ||
      verificado.versionCloudinary !== archivo.versionCloudinary
    )
      throw fallo();
    const body = new URLSearchParams();
    body.append('asset_ids[]', archivo.assetId!);
    await this.solicitar('resources', { method: 'DELETE', body });
    if (await this.buscarPorAsset(archivo)) throw fallo();
  }
}
