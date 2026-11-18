import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

type Recurso = { datos: Record<string, unknown>; contenido: Buffer };
function textoFormulario(body: FormData, campo: string): string {
  const valor = body.get(campo);
  if (typeof valor !== 'string')
    throw Error('Campo de formulario inválido: ' + campo);
  return valor;
}
export class CloudinarySimulado {
  readonly recursos = new Map<string, Recurso>();
  readonly peticiones = { subidas: 0, borrados: 0, consultas: 0, descargas: 0 };
  falloSubida: 'antes' | 'despues' | null = null;
  falloBorrado = false;
  perderRespuestaBorrado = false;
  contenidoIncorrecto = false;
  subidaEnEspera?: () => Promise<void>;
  borradoEnEspera?: () => Promise<void>;
  busquedaEnEspera?: () => Promise<void>;
  respuestaPerdida?: FormData;

  private json(valor: unknown, status = 200) {
    return new Response(JSON.stringify(valor), { status });
  }
  async materializar(body: FormData) {
    const publicId =
      (body.has('folder') ? textoFormulario(body, 'folder') + '/' : '') +
      textoFormulario(body, 'public_id');
    if (this.recursos.has(publicId)) return;
    const fichero = body.get('file');
    assert.ok(fichero instanceof Blob);
    const contenido = Buffer.from(await fichero.arrayBuffer()),
      meta = await sharp(contenido).metadata();
    const version = 1700000000,
      formato = meta.format === 'jpeg' ? 'jpg' : meta.format;
    const carpeta = textoFormulario(
      body,
      body.has('asset_folder') ? 'asset_folder' : 'folder',
    );
    const contexto = Object.fromEntries(
      textoFormulario(body, 'context')
        .split('|')
        .map((p) => p.split('=')),
    );
    const datos = {
      asset_id: randomUUID().replaceAll('-', ''),
      public_id: publicId,
      version,
      resource_type: 'image',
      type: 'upload',
      asset_folder: carpeta,
      format: formato,
      width: meta.width,
      height: meta.height,
      bytes: contenido.length,
      secure_url:
        'https://res.cloudinary.com/sintetico/image/upload/v' +
        version +
        '/' +
        publicId +
        '.' +
        formato,
      context: { custom: contexto },
    };
    this.recursos.set(publicId, { datos, contenido });
  }

  readonly http: typeof fetch = async (input, init = {}) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.hostname === 'res.cloudinary.com') {
      this.peticiones.descargas++;
      const r = [...this.recursos.values()].find(
        (x) => x.datos.secure_url === url.href,
      );
      return r
        ? new Response(
            new Uint8Array(
              this.contenidoIncorrecto
                ? Buffer.alloc(r.contenido.length)
                : r.contenido,
            ),
          )
        : this.json({}, 404);
    }
    assert.equal(url.hostname, 'api.cloudinary.com');
    assert.ok(url.pathname.startsWith('/v1_1/sintetico/'));
    assert.equal(
      new Headers(init.headers).get('Authorization'),
      'Basic ' + Buffer.from('123456:secreto-sintetico').toString('base64'),
    );
    const ruta = url.pathname.slice('/v1_1/sintetico/'.length);
    if (ruta === 'config')
      return this.json({ settings: { folder_mode: 'dynamic' } });
    if (ruta === 'image/upload') {
      this.peticiones.subidas++;
      assert.equal(init.method, 'POST');
      assert.ok(init.body instanceof FormData);
      const body = init.body,
        campos = [...body.entries()]
          .filter(([k]) => !['file', 'api_key', 'signature'].includes(k))
          .sort(([a], [b]) => a.localeCompare(b));
      assert.equal(
        body.get('signature'),
        createHash('sha256')
          .update(
            campos.map(([k]) => k + '=' + textoFormulario(body, k)).join('&') +
              'secreto-sintetico',
          )
          .digest('hex'),
      );
      assert.equal(body.get('overwrite'), 'false');
      assert.equal(body.get('use_asset_folder_as_public_id_prefix'), 'false');
      this.respuestaPerdida = body;
      if (this.subidaEnEspera) await this.subidaEnEspera();
      const fallo = this.falloSubida;
      this.falloSubida = null;
      if (fallo === 'antes')
        return this.json(
          { error: { message: 'Fallo sintético sin archivo' } },
          503,
        );
      const id = textoFormulario(body, 'public_id'),
        existente = this.recursos.has(id);
      await this.materializar(body);
      if (fallo === 'despues')
        throw new TypeError('Respuesta sintética perdida');
      return this.json(
        existente ? { existing: true } : this.recursos.get(id)!.datos,
      );
    }
    if (ruta.startsWith('resources/image/upload/')) {
      this.peticiones.consultas++;
      if (this.busquedaEnEspera) await this.busquedaEnEspera();
      const id = decodeURIComponent(
        ruta.slice('resources/image/upload/'.length),
      );
      return this.recursos.has(id)
        ? this.json(this.recursos.get(id)!.datos)
        : this.json({}, 404);
    }
    if (ruta === 'resources' && init.method === 'DELETE') {
      this.peticiones.borrados++;
      if (this.borradoEnEspera) await this.borradoEnEspera();
      if (this.falloBorrado) return this.json({ error: {} }, 503);
      assert.ok(init.body instanceof URLSearchParams);
      const assetId = init.body.get('asset_ids[]');
      assert.ok(assetId);
      const recurso = [...this.recursos.entries()].find(
        ([, r]) => r.datos.asset_id === assetId,
      );
      if (recurso) this.recursos.delete(recurso[0]);
      if (this.perderRespuestaBorrado) {
        this.perderRespuestaBorrado = false;
        throw new TypeError('Respuesta sintética perdida después de borrar');
      }
      return this.json({ deleted: { [assetId]: 'deleted' } });
    }
    if (ruta.startsWith('resources/')) {
      const assetId = decodeURIComponent(ruta.slice('resources/'.length)),
        r = [...this.recursos.values()].find(
          (x) => x.datos.asset_id === assetId,
        );
      return r ? this.json(r.datos) : this.json({}, 404);
    }
    throw Error('Petición externa inesperada en prueba de fotografías.');
  };
}
