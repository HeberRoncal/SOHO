import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type {
  EntradaCorrespondencia,
  ImagenAnteriorCorrespondencia,
  PlanCorrespondencia,
} from '../modelos-correspondencia/modelos-correspondencia.interface.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limiteContador = 4_294_967_295;

// UUID v5 con namespace fijo. Los mismos identificadores de origen producen el mismo plan.
function identidad(nombre: string): string {
  const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const b = createHash('sha1')
    .update(namespace)
    .update('soho/productos-color/v1/' + nombre)
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor !== null && typeof valor === 'object')
    return Object.fromEntries(
      Object.entries(valor)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonico(v)]),
    );
  return valor;
}

function objeto(v: unknown): asserts v is Record<string, unknown> {
  assert.ok(
    v !== null && typeof v === 'object' && !Array.isArray(v),
    'Se esperaba un objeto de correspondencia.',
  );
}
function texto(v: unknown, nullable = false): void {
  assert.ok(
    typeof v === 'string' || (nullable && v === null),
    'Campo de texto inválido.',
  );
}
function entero(v: unknown, max = 4_294_967_295): void {
  assert.ok(
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max,
    'Cantidad u orden inválido.',
  );
}
function validarImagenes(v: unknown): void {
  assert.ok(Array.isArray(v), 'Falta la lista de imágenes.');
  for (const i of v) {
    objeto(i);
    texto(i.id);
    assert.match(i.id as string, uuid);
    texto(i.ruta);
    texto(i.textoAlternativo);
    entero(i.orden);
  }
}
function validar(v: unknown): asserts v is EntradaCorrespondencia {
  objeto(v);
  assert.equal(v.version, 1, 'Versión de entrada no compatible.');
  assert.ok(Array.isArray(v.productos), 'Falta la lista de productos.');
  for (const p of v.productos) {
    objeto(p);
    texto(p.id);
    assert.match(p.id as string, uuid);
    for (const n of ['slug', 'codigoInterno', 'nombre', 'actualizadoEn'])
      texto(p[n]);
    for (const n of [
      'codigoModelo',
      'modelo',
      'marcaId',
      'grupoModeloId',
      'precio',
      'precioAnterior',
    ])
      texto(p[n], true);
    for (const n of ['precio', 'precioAnterior'])
      assert.ok(
        p[n] === null || /^\d{1,6}(?:\.\d{1,2})?$/.test(p[n] as string),
        'Importe decimal inválido.',
      );
    assert.ok(
      ['BORRADOR', 'PUBLICADO', 'ARCHIVADO'].includes(p.estado as string),
    );
    assert.ok((p.marca === null) === (p.marcaId === null), 'Marca incompleta.');
    if (p.marca !== null) {
      objeto(p.marca);
      texto(p.marca.codigo);
    }
    validarImagenes(p.imagenes);
    assert.ok(Array.isArray(p.colores), 'Falta la lista de colores.');
    for (const c of p.colores) {
      objeto(c);
      texto(c.id);
      assert.match(c.id as string, uuid);
      for (const n of ['codigo', 'nombre', 'hexadecimal']) texto(c[n]);
      entero(c.orden);
      validarImagenes(c.imagenes);
      assert.ok(Array.isArray(c.variantes), 'Falta la lista de variantes.');
      for (const variante of c.variantes) {
        objeto(variante);
        texto(variante.id);
        assert.match(variante.id as string, uuid);
        for (const n of ['sku', 'tallaId', 'actualizadoEn']) texto(variante[n]);
        texto(variante.productoId, true);
        objeto(variante.talla);
        texto(variante.talla.valor);
        entero(variante.existencias, 99999);
        entero(variante.cantidadReservada, 99999);
        assert.equal(typeof variante.habilitada, 'boolean');
      }
    }
  }
}
const ordenar = <T extends { orden: number; id: string }>(filas: T[]) =>
  [...filas].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

/** Construye un manifiesto revisable. No tiene cliente Prisma ni ejecuta escrituras. */
export class PlanCorrespondenciaProductos {
  archivoHeredadoId(productoId: string, ruta: string): string {
    return identidad('archivo/' + productoId + '/' + ruta);
  }

  crear(entrada: unknown): PlanCorrespondencia {
    validar(entrada);
    const productos = [...entrada.productos].sort(
      (a, b) =>
        a.codigoInterno.localeCompare(b.codigoInterno, 'en', {
          numeric: true,
        }) || a.id.localeCompare(b.id),
    );
    const fuente = productos.map((p) => ({
      ...p,
      imagenes: ordenar(p.imagenes),
      colores: ordenar(p.colores).map((c) => ({
        ...c,
        imagenes: ordenar(c.imagenes),
        variantes: [...c.variantes].sort((a, b) => a.id.localeCompare(b.id)),
      })),
    }));
    const plan: PlanCorrespondencia = {
      version: 1,
      tipo: 'SOLO_PLAN_SIN_ESCRITURAS',
      huellaOrigen: createHash('sha256')
        .update(JSON.stringify(canonico(fuente)))
        .digest('hex'),
      aptoParaRevision: true,
      incidencias: [],
      advertencias: [],
      ultimoNumeroExistente: 0,
      ultimoNumeroPropuesto: 0,
      grupos: [],
      productos: [],
      alias: [],
    };
    const incidencia = (codigo: string, productoId: string, detalle: string) =>
      plan.incidencias.push({ codigo, productoId, detalle });
    const usados = new Map<string, string>();
    function reservar(tipo: string, valor: string, id: string) {
      const clave = tipo + ':' + valor.toLowerCase();
      if (usados.has(clave))
        incidencia('COLISION_' + tipo.toUpperCase(), id, valor);
      else usados.set(clave, id);
    }
    for (const p of fuente) {
      reservar('producto', p.id, p.id);
      reservar('slug', p.slug, p.id);
      reservar('codigo', p.codigoInterno, p.id);
      const numero = /^SHO-\d{4,}$/.test(p.codigoInterno)
        ? Number(p.codigoInterno.slice(4))
        : NaN;
      if (
        !Number.isInteger(numero) ||
        numero < 1 ||
        numero > limiteContador ||
        p.codigoInterno !== 'SHO-' + String(numero).padStart(4, '0')
      )
        incidencia('CODIGO_INTERNO_REVISAR', p.id, p.codigoInterno);
      else
        plan.ultimoNumeroExistente = Math.max(
          plan.ultimoNumeroExistente,
          numero,
        );
    }
    plan.ultimoNumeroPropuesto = plan.ultimoNumeroExistente;
    for (const p of fuente) {
      const grupoModeloId = identidad('grupo/' + p.id);
      const carpeta = slug(p.nombre);
      reservar('carpeta', carpeta, p.id);
      if (!carpeta || carpeta.length > 160)
        incidencia('CARPETA_REVISAR', p.id, carpeta);
      if (p.grupoModeloId !== null)
        incidencia(
          'CONVERSION_INICIADA',
          p.id,
          'El producto ya tiene grupo destino.',
        );
      if (p.codigoModelo !== null && !/^[A-Z0-9]{1,60}$/.test(p.codigoModelo))
        incidencia('MODELO_REVISAR', p.id, p.codigoModelo);
      if (p.marca && !/^[A-Z0-9]{1,12}$/.test(p.marca.codigo))
        incidencia('MARCA_REVISAR', p.id, p.marca.codigo);
      if (p.marcaId && p.codigoModelo)
        reservar('modelo', p.marcaId + '/' + p.codigoModelo, p.id);
      if (
        p.estado === 'PUBLICADO' &&
        (!p.marcaId ||
          !p.codigoModelo ||
          !p.modelo ||
          !p.colores.length ||
          p.precio === null)
      )
        incidencia(
          'PUBLICACION_INCOMPLETA',
          p.id,
          'Requiere resolución explícita antes de convertir.',
        );
      plan.grupos.push({
        id: grupoModeloId,
        productoAnteriorId: p.id,
        marcaId: p.marcaId,
        codigoModelo: p.codigoModelo,
        modelo: p.modelo,
        slugCarpeta: carpeta,
      });
      const fotosColores = new Set(
        p.colores.flatMap((c) => c.imagenes.map((i) => i.ruta)),
      );
      const generales = p.imagenes.filter((i) => !fotosColores.has(i.ruta));
      if (p.colores.length > 1 && generales.length)
        plan.advertencias.push({
          codigo: 'FOTOS_GENERALES_COMPARTIDAS',
          productoId: p.id,
        });
      for (const [indice, color] of (p.colores.length
        ? p.colores
        : [null]
      ).entries()) {
        const principal = indice === 0;
        const productoDestinoId = principal
          ? p.id
          : identidad('producto/' + color!.id);
        let codigoInterno = p.codigoInterno;
        const slugDestino = principal
          ? p.slug
          : p.slug + '-' + slug(color!.nombre);
        if (!principal) {
          ++plan.ultimoNumeroPropuesto;
          codigoInterno =
            'SHO-' + String(plan.ultimoNumeroPropuesto).padStart(4, '0');
          reservar('codigo', codigoInterno, p.id);
          reservar('slug', slugDestino, p.id);
          reservar('producto', productoDestinoId, p.id);
        }
        if (plan.ultimoNumeroPropuesto > limiteContador)
          incidencia(
            'CONTADOR_AGOTADO',
            p.id,
            'No se pueden asignar más códigos.',
          );
        if (
          !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugDestino) ||
          slugDestino.length > 160
        )
          incidencia('SLUG_REVISAR', p.id, slugDestino);
        const nombre = color ? p.nombre + ' ' + color.nombre : p.nombre;
        if (!nombre.trim() || nombre.length > 180)
          incidencia('NOMBRE_REVISAR', p.id, nombre);
        if (color) {
          reservar('color', color.id, p.id);
          reservar('color_grupo', grupoModeloId + '/' + color.codigo, p.id);
          if (
            !/^[A-Z]{2}$/.test(color.codigo) ||
            !color.nombre.trim() ||
            !/^#[0-9a-f]{6}$/i.test(color.hexadecimal)
          )
            incidencia('COLOR_REVISAR', p.id, color.codigo);
        }
        const galeria: (ImagenAnteriorCorrespondencia & {
          imagenAnteriorId: string;
          archivoId: string;
        })[] = [];
        const rutas = new Set<string>();
        for (const imagen of [...(color?.imagenes ?? []), ...generales])
          if (!rutas.has(imagen.ruta)) {
            rutas.add(imagen.ruta);
            if (!imagen.ruta.trim() || imagen.ruta.length > 1024)
              incidencia('RUTA_REVISAR', p.id, imagen.id);
            galeria.push({
              ...imagen,
              id: identidad(
                'asociacion/' + productoDestinoId + '/' + imagen.ruta,
              ),
              imagenAnteriorId: imagen.id,
              orden: galeria.length,
              archivoId: identidad(
                'archivo/' + productoDestinoId + '/' + imagen.ruta,
              ),
            });
          }
        if (galeria.length > 10 || (p.estado === 'PUBLICADO' && !galeria.length))
          incidencia(
            'GALERIA_REVISAR',
            p.id,
            'Número de fotos: ' + galeria.length,
          );
        const variantes = (color?.variantes ?? []).map((v) => {
          reservar('variante', v.id, p.id);
          reservar('sku', v.sku, p.id);
          reservar('talla_producto', productoDestinoId + '/' + v.tallaId, p.id);
          if (v.productoId !== null)
            incidencia(
              'CONVERSION_INICIADA',
              p.id,
              'Una variante ya tiene producto destino.',
            );
          return { ...v, productoDestinoId };
        });
        if (p.estado === 'PUBLICADO' && !variantes.some((v) => v.habilitada))
          incidencia(
            'SIN_VARIANTE_HABILITADA',
            p.id,
            color?.codigo ?? 'Sin color',
          );
        plan.productos.push({
          productoAnteriorId: p.id,
          colorAnteriorId: color?.id ?? null,
          grupoModeloId,
          productoDestinoId,
          conservaIdentidad: principal,
          codigoInterno,
          slug: slugDestino,
          nombre,
          codigoColor: color?.codigo ?? null,
          colorNombre: color?.nombre ?? null,
          colorHexadecimal: color?.hexadecimal ?? null,
          ordenColor: color?.orden ?? 0,
          precio: p.precio,
          precioAnterior: p.precioAnterior,
          variantes,
          galeria,
        });
        if (principal)
          plan.alias.push({
            slugAnterior: p.slug,
            codigoColor: '',
            productoDestinoId,
          });
        if (color)
          plan.alias.push({
            slugAnterior: p.slug,
            codigoColor: color.codigo,
            productoDestinoId,
          });
      }
    }
    plan.aptoParaRevision = plan.incidencias.length === 0;
    return plan;
  }
}
