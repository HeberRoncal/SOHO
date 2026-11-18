export const ESTADOS_RECEPCION = {
  RECIBIENDO: 'Recibiendo comprobante',
  RECIBIDA: 'Recibida',
  REQUIERE_ATENCION: 'Requiere atención',
  PEDIDO_CREADO: 'Pedido creado',
} as const;
export type EstadoRecepcion = keyof typeof ESTADOS_RECEPCION;
export const MOTIVOS_RECEPCION: Record<string, string> = {
  PRECIO_CAMBIADO: 'Cambió el precio de un artículo',
  STOCK_INSUFICIENTE: 'No hay disponibilidad completa',
  ARTICULO_NO_DISPONIBLE: 'Un artículo ya no está disponible',
  COBERTURA_DESHABILITADA: 'La cobertura está deshabilitada',
  COBERTURA_TARIFA_PENDIENTE: 'La tarifa de entrega está pendiente',
  COTIZACION_CAMBIADA: 'Cambió la tarifa o el plazo de entrega',
  TOTAL_CAMBIADO: 'Cambió el importe total',
  COMPROBANTE_REQUIERE_CORRECCION: 'Se solicitó otra imagen del comprobante',
  INVENTARIO_INCONSISTENTE: 'El inventario necesita revisión',
  PREPARACION_INCONSISTENTE: 'La preparación necesita revisión',
};
export type AccionRecepcion = 'REGISTRAR_PEDIDO' | 'SOLICITAR_CORRECCION';
export interface FilaRecepcion {
  id: string;
  referencia: string;
  estado: EstadoRecepcion;
  version: number;
  creadoEn: string;
  contacto: { nombres: string; apellidos: string; correo: string };
  metodo: 'YAPE' | 'PLIN';
  importeReferencia: string;
  distrito: string;
  motivos: string[];
  pedido: { codigo: string } | null;
  comprador: 'CUENTA' | 'INVITADO';
}
export interface ComprobanteRecepcion {
  id: string;
  version: number;
  nombreArchivo: string;
  formato: string;
  tamanoBytes: number;
  numeroOperacion: string | null;
  estadoArchivo: 'PENDIENTE' | 'DISPONIBLE';
  confirmadoEn: string | null;
}
export interface RecepcionAdmin {
  id: string;
  referencia: string;
  estado: EstadoRecepcion;
  version: number;
  creadoEn: string;
  motivos: string[];
  pedido: { codigo: string } | null;
  comprobante: ComprobanteRecepcion;
  contacto: FilaRecepcion['contacto'];
  metodo: FilaRecepcion['metodo'];
  total: string;
  entrega: {
    destinatario: string;
    celular: string;
    distrito: string;
    direccion: string;
    referencia: string;
  };
  facturacion: {
    tipo: string;
    tipoDocumento: string;
    numeroDocumento: string;
    razonSocial: string;
    domicilioFiscal: string;
  } | null;
  destino: { celular: string; titular: string };
  distritoNombre: string;
  subtotal: string;
  costoEnvio: string;
  plazoEntrega: string | null;
  articulos: {
    sku: string;
    nombre: string;
    color: string;
    sistemaTalla: string;
    talla: string;
    cantidad: number;
    precioUnitario: string;
    importe: string;
  }[];
}
export interface DetalleRecepcion {
  recepcion: RecepcionAdmin;
  diagnostico: { actual: DiagnosticoRecepcion; condicionesOriginales: DiagnosticoRecepcion };
  comprobantes: ComprobanteRecepcion[];
  historial: {
    id: string;
    accion: string;
    estado: string;
    actor: string;
    responsable: { id: string; nombres: string; apellidos: string } | null;
    motivoInterno: string | null;
    mensaje: string | null;
    versionEsperada: number;
    versionResultante: number | null;
    creadoEn: string;
    finalizadoEn: string | null;
  }[];
  capacidades: { registrarPedido: boolean; solicitarCorreccion: boolean };
}
export interface DiagnosticoRecepcion {
  apto: boolean;
  motivos: string[];
}
export interface DecisionRecepcion {
  claveSolicitud: string;
  versionEsperada: number;
  comprobanteActualId: string;
  motivo: string;
  confirmado: true;
  aceptarCondicionesOriginales?: true;
  mensaje?: string;
}
export function decisionRecepcionGuardada(
  v: unknown,
  accion: AccionRecepcion,
): Readonly<DecisionRecepcion> {
  const d = objetoRecepcion(v);
  const campos = [
    'claveSolicitud',
    'versionEsperada',
    'comprobanteActualId',
    'motivo',
    'confirmado',
    accion === 'REGISTRAR_PEDIDO' ? 'aceptarCondicionesOriginales' : 'mensaje',
  ];
  if (
    Object.keys(d).length !== campos.length ||
    Object.keys(d).some((k) => !campos.includes(k)) ||
    d['confirmado'] !== true
  )
    throw Error('Solicitud guardada inválida.');
  const motivo = texto(d['motivo'], 300);
  if ([...motivo].length < 3 || /[\p{Cc}\p{Cf}]/u.test(motivo)) throw Error('Motivo inválido.');
  if (accion === 'REGISTRAR_PEDIDO' && d['aceptarCondicionesOriginales'] !== true)
    throw Error('Confirmación inválida.');
  const mensaje = accion === 'SOLICITAR_CORRECCION' ? texto(d['mensaje'], 500) : '';
  if (
    accion === 'SOLICITAR_CORRECCION' &&
    ([...mensaje].length < 3 || /[\p{Cc}\p{Cf}]/u.test(mensaje))
  )
    throw Error('Mensaje inválido.');
  return Object.freeze({
    claveSolicitud: uuidRecepcion(d['claveSolicitud']),
    versionEsperada: numero(d['versionEsperada']),
    comprobanteActualId: uuidRecepcion(d['comprobanteActualId']),
    motivo,
    confirmado: true,
    ...(accion === 'REGISTRAR_PEDIDO'
      ? { aceptarCondicionesOriginales: true as const }
      : { mensaje }),
  });
}
export interface ResultadoRecepcion {
  recepcion: RecepcionAdmin;
  clave: string;
  pendiente: boolean;
  resultado: 'PEDIDO_CREADO' | 'REQUIERE_ATENCION' | 'SOLICITAR_CORRECCION' | null;
}
export const PAGINA_RECEPCIONES = { pagina: 1, limite: 20, total: 0, paginas: 0 };
export function objetoRecepcion(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('Respuesta de recepción inválida.');
  return v as Record<string, unknown>;
}
function texto(v: unknown, max = 500, vacio = false): string {
  if (
    typeof v !== 'string' ||
    (!vacio && !v.trim()) ||
    [...v].length > max ||
    /[\p{Cc}\p{Cf}]/u.test(v.replace(/[\r\n]/g, ''))
  )
    throw Error('Texto inválido.');
  return v;
}
export function uuidRecepcion(v: unknown): string {
  if (
    typeof v !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  )
    throw Error('Identificador inválido.');
  return v.toLowerCase();
}
function numero(v: unknown, min = 1, max = 4294967295): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw Error('Número inválido.');
  return v;
}
function fecha(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v)))
    throw Error('Fecha inválida.');
  return v;
}
function opcion<T extends string>(v: unknown, opciones: readonly T[]): T {
  if (typeof v !== 'string' || !opciones.includes(v as T)) throw Error('Estado inválido.');
  return v as T;
}
function lista<T>(v: unknown, adaptar: (v: unknown) => T): T[] {
  if (!Array.isArray(v)) throw Error('Lista inválida.');
  return v.map(adaptar);
}
function importe(v: unknown) {
  if (typeof v !== 'string' || !/^(0|[1-9]\d{0,11})\.\d{2}$/.test(v))
    throw Error('Importe inválido.');
  return v;
}
const motivos = (v: unknown) => lista(v, (m) => opcion(m, Object.keys(MOTIVOS_RECEPCION)));
const contacto = (v: unknown) => {
  const c = objetoRecepcion(v);
  return {
    nombres: texto(c['nombres'], 80),
    apellidos: texto(c['apellidos'], 100),
    correo: texto(c['correo'], 254),
  };
};
const pedido = (v: unknown) => {
  if (v === null) return null;
  const codigo = texto(objetoRecepcion(v)['codigo'], 40);
  if (!/^SOHO-[A-Z0-9-]+$/.test(codigo)) throw Error('Pedido inválido.');
  return { codigo };
};
export function comprobanteRecepcion(v: unknown): ComprobanteRecepcion {
  const c = objetoRecepcion(v);
  return {
    id: uuidRecepcion(c['id']),
    version: numero(c['version']),
    nombreArchivo: texto(c['nombreArchivo'], 180),
    formato: opcion(c['formato'], ['image/png', 'image/jpeg', 'image/webp']),
    tamanoBytes: numero(c['tamanoBytes'], 1, 5 * 1024 * 1024),
    numeroOperacion: c['numeroOperacion'] === null ? null : texto(c['numeroOperacion'], 100),
    estadoArchivo: opcion(c['estadoArchivo'], ['PENDIENTE', 'DISPONIBLE']),
    confirmadoEn: c['confirmadoEn'] === null ? null : fecha(c['confirmadoEn']),
  };
}
export function filaRecepcion(v: unknown): FilaRecepcion {
  const r = objetoRecepcion(v);
  return {
    id: uuidRecepcion(r['id']),
    referencia: texto(r['referencia'], 40),
    estado: opcion(r['estado'], Object.keys(ESTADOS_RECEPCION) as EstadoRecepcion[]),
    version: numero(r['version']),
    creadoEn: fecha(r['creadoEn']),
    contacto: contacto(r['contacto']),
    metodo: opcion(r['metodo'], ['YAPE', 'PLIN']),
    importeReferencia: importe(r['importeReferencia']),
    distrito: texto(r['distrito'], 80),
    motivos: motivos(r['motivos']),
    pedido: pedido(r['pedido']),
    comprador: opcion(r['comprador'], ['CUENTA', 'INVITADO']),
  };
}
export function recepcionAdmin(v: unknown): RecepcionAdmin {
  const r = objetoRecepcion(v),
    i = objetoRecepcion(r['instruccion']),
    p = objetoRecepcion(i['preparacion']),
    e = objetoRecepcion(p['entrega']),
    d = objetoRecepcion(i['destino']),
    ver = objetoRecepcion(i['verificacion']);
  if (r['versionContrato'] !== 1 || i['versionContrato'] !== 1 || i['moneda'] !== 'PEN')
    throw Error('Contrato inválido.');
  const articulos = lista(ver['articulos'], (v) => {
    const a = objetoRecepcion(v);
    const cantidad = numero(a['cantidad'], 1, 100),
      precioUnitario = importe(a['precioUnitario']),
      bruto = importe(a['importe']);
    if (Math.round(Number(precioUnitario) * 100) * cantidad !== Math.round(Number(bruto) * 100))
      throw Error('Línea inconsistente.');
    return {
      sku: texto(a['sku'], 120),
      nombre: texto(a['nombreProducto'], 180),
      color: texto(a['color'], 80),
      sistemaTalla: texto(a['sistemaTalla'], 12),
      talla: texto(a['talla'], 8),
      cantidad,
      precioUnitario,
      importe: bruto,
    };
  });
  const total = importe(i['importeReferencia']),
    subtotal = importe(ver['subtotal']),
    costoEnvio = importe(ver['costoEnvio']);
  const centimos = (v: string) => Math.round(Number(v) * 100);
  if (
    !articulos.length ||
    articulos.length > 50 ||
    articulos.reduce((n, a) => n + a.cantidad, 0) > 100 ||
    centimos(subtotal) + centimos(costoEnvio) !== centimos(total) ||
    articulos.reduce((n, a) => n + centimos(a.importe), 0) !== centimos(subtotal) ||
    ver['total'] !== total
  )
    throw Error('Totales inconsistentes.');
  let facturacion: RecepcionAdmin['facturacion'] = null;
  if (p['facturacion'] !== undefined) {
    const f = objetoRecepcion(p['facturacion']);
    facturacion = {
      tipo: opcion(f['tipo'], ['BOLETA', 'FACTURA']),
      tipoDocumento: opcion(f['tipoDocumento'], ['DNI', 'CE', 'PAS', 'RUC']),
      numeroDocumento: texto(f['numeroDocumento'], 12),
      razonSocial: texto(f['razonSocial'] ?? '', 160, true),
      domicilioFiscal: texto(f['domicilioFiscal'] ?? '', 180, true),
    };
  }
  const estado = opcion(r['estado'], Object.keys(ESTADOS_RECEPCION) as EstadoRecepcion[]),
    orden = pedido(r['pedido']),
    comp = comprobanteRecepcion(r['comprobante']);
  if (
    (estado === 'PEDIDO_CREADO') !== !!orden ||
    (estado !== 'RECIBIENDO' && comp.estadoArchivo !== 'DISPONIBLE')
  )
    throw Error('Recepción inconsistente.');
  return {
    id: uuidRecepcion(r['id']),
    referencia: texto(r['referencia'], 40),
    estado,
    version: numero(r['version']),
    creadoEn: fecha(r['creadoEn']),
    motivos: motivos(r['motivos']),
    pedido: orden,
    comprobante: comp,
    contacto: contacto(p['contacto']),
    metodo: opcion(i['metodo'], ['YAPE', 'PLIN']),
    total,
    entrega: {
      destinatario: texto(e['destinatario'], 140),
      celular: texto(e['celular'], 9),
      distrito: texto(e['distrito'], 80),
      direccion: texto(e['direccion'], 180),
      referencia: texto(e['referencia'], 200, true),
    },
    destino: { titular: texto(d['titular'], 160), celular: texto(d['celular'], 9) },
    distritoNombre: texto(ver['distritoNombre'], 80),
    subtotal,
    costoEnvio,
    plazoEntrega: ver['plazoEntrega'] === null ? null : texto(ver['plazoEntrega'], 80),
    articulos,
    facturacion,
  };
}
function diagnostico(v: unknown): DiagnosticoRecepcion {
  const d = objetoRecepcion(v);
  if (typeof d['apto'] !== 'boolean') throw Error('Diagnóstico inválido.');
  const m = motivos(d['motivos']);
  if (d['apto'] === !!m.length) throw Error('Diagnóstico inconsistente.');
  return { apto: d['apto'], motivos: m };
}
export function detalleRecepcion(v: unknown): DetalleRecepcion {
  const d = objetoRecepcion(v),
    r = recepcionAdmin(d['recepcion']),
    diag = objetoRecepcion(d['diagnostico']),
    c = objetoRecepcion(d['capacidades']);
  if (typeof c['registrarPedido'] !== 'boolean' || typeof c['solicitarCorreccion'] !== 'boolean')
    throw Error('Capacidades inválidas.');
  const comprobantes = lista(d['comprobantes'], comprobanteRecepcion);
  const actuales = comprobantes.filter((c) => c.id === r.comprobante.id);
  if (
    actuales.length !== 1 ||
    JSON.stringify(actuales[0]) !== JSON.stringify(r.comprobante) ||
    new Set(comprobantes.map((c) => c.id)).size !== comprobantes.length ||
    new Set(comprobantes.map((c) => c.version)).size !== comprobantes.length
  )
    throw Error('Versiones inconsistentes.');
  const historial = lista(d['historial'], (v) => {
    const h = objetoRecepcion(v),
      a = h['responsable'] === null ? null : objetoRecepcion(h['responsable']);
    return {
      id: uuidRecepcion(h['id']),
      accion: opcion(h['accion'], [
        'PROCESAR',
        'REGISTRAR_PEDIDO',
        'SOLICITAR_CORRECCION',
        'ADJUNTAR_COMPROBANTE',
      ]),
      estado: opcion(h['estado'], ['PENDIENTE', 'CONFIRMADA', 'RECHAZADA']),
      actor: opcion(h['actor'], ['ADMIN', 'CLIENTE', 'INVITADO', 'SISTEMA']),
      responsable: a
        ? {
            id: uuidRecepcion(a['id']),
            nombres: texto(a['nombres'], 80),
            apellidos: texto(a['apellidos'], 100),
          }
        : null,
      motivoInterno: h['motivoInterno'] === null ? null : texto(h['motivoInterno'], 300),
      mensaje: h['mensaje'] === null ? null : texto(h['mensaje'], 500),
      versionEsperada: numero(h['versionEsperada']),
      versionResultante: h['versionResultante'] === null ? null : numero(h['versionResultante']),
      creadoEn: fecha(h['creadoEn']),
      finalizadoEn: h['finalizadoEn'] === null ? null : fecha(h['finalizadoEn']),
    };
  });
  const originales = diagnostico(diag['condicionesOriginales']);
  const impedida =
    r.motivos.includes('COMPROBANTE_REQUIERE_CORRECCION') ||
    historial.some((h) => h.estado === 'PENDIENTE');
  if (
    (c['registrarPedido'] && (r.estado !== 'REQUIERE_ATENCION' || impedida || !originales.apto)) ||
    (c['solicitarCorreccion'] &&
      (!['RECIBIDA', 'REQUIERE_ATENCION'].includes(r.estado) || impedida))
  )
    throw Error('Acciones inconsistentes.');
  return {
    recepcion: r,
    comprobantes,
    historial,
    diagnostico: { actual: diagnostico(diag['actual']), condicionesOriginales: originales },
    capacidades: {
      registrarPedido: c['registrarPedido'],
      solicitarCorreccion: c['solicitarCorreccion'],
    },
  };
}
export function listadoRecepciones(v: unknown) {
  const d = objetoRecepcion(v),
    p = objetoRecepcion(d['paginacion']),
    resumen = objetoRecepcion(d['resumen']);
  const paginacion = {
    pagina: numero(p['pagina'], 1, 100000),
    limite: numero(p['limite'], 1, 50),
    total: numero(p['total'], 0, Number.MAX_SAFE_INTEGER),
    paginas: numero(p['paginas'], 0, Number.MAX_SAFE_INTEGER),
  };
  const filas = lista(d['recepciones'], filaRecepcion);
  if (
    paginacion.paginas !== Math.ceil(paginacion.total / paginacion.limite) ||
    filas.length > paginacion.limite ||
    new Set(filas.map((r) => r.id)).size !== filas.length
  )
    throw Error('Paginación inválida.');
  const conteos = Object.fromEntries(
    Object.keys(ESTADOS_RECEPCION).map((e) => [e, numero(resumen[e], 0, Number.MAX_SAFE_INTEGER)]),
  ) as Record<EstadoRecepcion, number>;
  return { filas, paginacion, resumen: conteos };
}
export function resultadoRecepcion(
  v: unknown,
  id: string,
  clave: string,
  accion: AccionRecepcion,
  pendiente: boolean,
): ResultadoRecepcion {
  const d = objetoRecepcion(v),
    op = objetoRecepcion(d['operacion']),
    r = recepcionAdmin(d['recepcion']);
  if (
    r.id !== id ||
    uuidRecepcion(op['claveSolicitud']) !== clave ||
    op['estado'] !== (pendiente ? 'PENDIENTE' : 'CONFIRMADA')
  )
    throw Error('Resultado de otra operación.');
  let resultado: ResultadoRecepcion['resultado'] = null;
  if (pendiente) {
    if (d['resultado'] !== null) throw Error('Resultado pendiente inválido.');
  } else if (accion === 'SOLICITAR_CORRECCION') {
    resultado = opcion(d['resultado'], ['SOLICITAR_CORRECCION'] as const);
    const c = objetoRecepcion(d['correccion']);
    uuidRecepcion(c['solicitudId']);
    texto(c['mensaje'], 500);
    if (r.estado !== 'REQUIERE_ATENCION' || !r.motivos.includes('COMPROBANTE_REQUIERE_CORRECCION'))
      throw Error('Corrección inválida.');
  } else {
    resultado = opcion(d['resultado'], ['PEDIDO_CREADO', 'REQUIERE_ATENCION'] as const);
    if (r.estado !== resultado || JSON.stringify(pedido(d['pedido'])) !== JSON.stringify(r.pedido))
      throw Error('Registro inválido.');
  }
  return { recepcion: r, clave, pendiente, resultado };
}
const dinero = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const fechas = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Lima',
  hour12: false,
});
export const importeRecepcion = (v: string) => dinero.format(Number(v));
export const fechaRecepcion = (v: string) => fechas.format(new Date(v));
export const motivoRecepcion = (v: string) =>
  MOTIVOS_RECEPCION[v] ?? 'La recepción necesita revisión';
