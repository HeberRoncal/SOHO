export interface DatosTienda {
  correo: string;
  whatsapp: string;
  horario: string;
  enlaces: { texto: string; url: string }[];
  politicas: { cambios: string; privacidad: string; terminos: string };
}
export interface ConfiguracionTienda {
  version: number;
  actualizadoEn: string | null;
  actualizadoPor: { id: string; nombre: string } | null;
  tienda: DatosTienda;
}
export function tiendaVacia(): DatosTienda {
  return {
    correo: '',
    whatsapp: '',
    horario: '',
    enlaces: [
      { texto: 'Ayuda con mi pedido', url: '' },
      { texto: 'Cambios y devoluciones', url: '' },
    ],
    politicas: { cambios: '', privacidad: '', terminos: '' },
  };
}
const control = (s: string, multi = false) =>
  /[\p{Cc}\p{Cf}]/u.test(multi ? s.replace(/[\r\n\t]/g, '') : s);
export function erroresTienda(t: DatosTienda): Record<string, string> {
  const e: Record<string, string> = {};
  if (
    t.correo.length > 160 ||
    control(t.correo) ||
    (t.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(t.correo.trim()))
  )
    e['correo'] = 'Ingresa un correo válido de hasta 160 caracteres.';
  if (
    control(t.whatsapp) ||
    (t.whatsapp.trim() && !/^9\d{8}$/.test(t.whatsapp.replace(/ /g, '').trim()))
  )
    e['whatsapp'] = 'Ingresa 9 dígitos que comiencen con 9.';
  if (t.horario.length > 160 || control(t.horario))
    e['horario'] = 'Usa hasta 160 caracteres sin saltos de línea.';
  if (t.enlaces.length !== 2) e['enlaces'] = 'Conserva los dos enlaces de ayuda.';
  t.enlaces.forEach((l, i) => {
    let valido =
      !control(l.texto) && !control(l.url) && l.texto.length <= 100 && l.url.length <= 2048;
    const url = l.url.trim();
    if (url) {
      valido = valido && !!l.texto.trim() && /^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/u.test(url);
      try {
        const u = new URL(url);
        valido = valido && !!u.hostname && !u.username && !u.password;
      } catch {
        valido = false;
      }
    }
    if (!valido)
      e['enlace-' + i] =
        'Usa texto de hasta 100 caracteres y una URL HTTP o HTTPS sin credenciales.';
  });
  for (const p of ['cambios', 'privacidad', 'terminos'] as const)
    if (t.politicas[p].length > 10000 || control(t.politicas[p], true))
      e[p] = 'Usa hasta 10000 caracteres de texto.';
  return e;
}
export function datosTiendaApi(t: DatosTienda) {
  const normalizar = (s: string) => s.normalize('NFC').trim() || null;
  return {
    correo: normalizar(t.correo)?.toLowerCase() ?? null,
    whatsapp: normalizar(t.whatsapp)?.replace(/ /g, '') ?? null,
    horario: normalizar(t.horario),
    enlaces: t.enlaces.map((l) => ({ texto: normalizar(l.texto) ?? '', url: normalizar(l.url) })),
    politicas: {
      cambios: normalizar(t.politicas.cambios),
      privacidad: normalizar(t.politicas.privacidad),
      terminos: normalizar(t.politicas.terminos),
    },
  };
}
function objeto(v: unknown, campos: string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(',') !== [...campos].sort().join(',')
  )
    throw Error('Respuesta de Tienda no válida.');
  return v as Record<string, unknown>;
}
const cadena = (v: unknown) => {
  if (v === null) return '';
  if (typeof v !== 'string') throw Error('Campo de Tienda no válido.');
  return v;
};
export function tiendaDesdeApi(v: unknown): DatosTienda {
  const t = objeto(v, ['correo', 'whatsapp', 'horario', 'enlaces', 'politicas']),
    p = objeto(t['politicas'], ['cambios', 'privacidad', 'terminos']);
  if (!Array.isArray(t['enlaces']) || t['enlaces'].length !== 2)
    throw Error('Enlaces de Tienda no válidos.');
  const tienda = {
    correo: cadena(t['correo']),
    whatsapp: cadena(t['whatsapp']),
    horario: cadena(t['horario']),
    enlaces: t['enlaces'].map((l) => {
      const e = objeto(l, ['texto', 'url']);
      return { texto: cadena(e['texto']), url: cadena(e['url']) };
    }),
    politicas: {
      cambios: cadena(p['cambios']),
      privacidad: cadena(p['privacidad']),
      terminos: cadena(p['terminos']),
    },
  };
  if (Object.keys(erroresTienda(tienda)).length) throw Error('Contenido de Tienda no válido.');
  return tienda;
}
export const uuidTienda = (v: unknown) => {
  if (
    typeof v !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v)
  )
    throw Error('Clave de Tienda no válida.');
  return v;
};
export function solicitudTienda(v: unknown) {
  const d = objeto(v, ['claveSolicitud', 'versionEsperada', 'tienda']);
  if (
    typeof d['versionEsperada'] !== 'number' ||
    !Number.isSafeInteger(d['versionEsperada']) ||
    d['versionEsperada'] < 0 ||
    d['versionEsperada'] >= 4294967295
  )
    throw Error('Versión de Tienda no válida.');
  const tienda = datosTiendaApi(tiendaDesdeApi(d['tienda']));
  return {
    claveSolicitud: uuidTienda(d['claveSolicitud']),
    versionEsperada: d['versionEsperada'],
    tienda,
  };
}
export function respuestaTienda(v: unknown): ConfiguracionTienda {
  if (!v || typeof v !== 'object') throw Error('Respuesta de Tienda no válida.');
  const c = objeto((v as Record<string, unknown>)['configuracion'], [
    'version',
    'actualizadoEn',
    'actualizadoPor',
    'tienda',
  ]);
  if (
    typeof c['version'] !== 'number' ||
    !Number.isSafeInteger(c['version']) ||
    c['version'] < 0 ||
    c['version'] > 4294967295
  )
    throw Error('Versión no válida.');
  const version = c['version'];
  let actualizadoPor = null,
    actualizadoEn = null;
  if (version === 0) {
    if (c['actualizadoEn'] !== null || c['actualizadoPor'] !== null)
      throw Error('Metadatos no válidos.');
  } else {
    const a = objeto(c['actualizadoPor'], ['id', 'nombre']);
    const nombre = cadena(a['nombre']);
    if (!nombre) throw Error('Responsable no válido.');
    actualizadoPor = { id: uuidTienda(a['id']), nombre };
    if (typeof c['actualizadoEn'] !== 'string' || !Number.isFinite(Date.parse(c['actualizadoEn'])))
      throw Error('Fecha no válida.');
    actualizadoEn = c['actualizadoEn'];
  }
  return { version, actualizadoPor, actualizadoEn, tienda: tiendaDesdeApi(c['tienda']) };
}
export type SolicitudTienda = ReturnType<typeof solicitudTienda>;
