import {
  CODIGO_PEDIDO,
  SolicitudPedido,
  centimos,
  registro,
  texto,
} from '../../pedidos/modelos/contrato-pedidos';

export type MetodoCheckout = 'YAPE' | 'PLIN';
export type PreparacionCompra = Pick<
  SolicitudPedido,
  'contacto' | 'entrega' | 'facturacion' | 'articulos' | 'cotizacion'
>;
export interface MetodosCheckout {
  version: number;
  disponible: boolean;
  metodos: Array<{ metodo: MetodoCheckout; nombre: string }>;
}
export interface InstruccionCompra {
  versionContrato: 1;
  instruccionId: string;
  claveCreacionPedido: string;
  metodo: MetodoCheckout;
  versionConfiguracion: number;
  emitidaEn: string;
  importeReferencia: string;
  moneda: 'PEN';
  preparacion: PreparacionCompra;
  verificacion: {
    distritoNombre: string;
    subtotal: string;
    costoEnvio: string;
    plazoEntrega: string | null;
    total: string;
    articulos: Array<{
      sku: string;
      nombreProducto: string;
      color: string;
      talla: string;
      cantidad: number;
      precioUnitario: string;
      importe: string;
    }>;
  };
  destino: {
    celular: string;
    titular: string;
    qr: null | { id: string; url: string; formato: string; ancho: number; alto: number };
  };
  accesoExpiraEn: string | null;
}
export interface RecepcionCompra {
  versionContrato: 1;
  id: string;
  referencia: string;
  claveSolicitud: string;
  claveCreacionPedido: string;
  estado: 'RECIBIENDO' | 'RECIBIDA' | 'REQUIERE_ATENCION' | 'PEDIDO_CREADO';
  version: number;
  creadoEn: string;
  recibidaEn: string | null;
  accesoExpiraEn: string | null;
  instruccion: InstruccionCompra;
  comprobante: {
    id: string;
    version: number;
    nombreArchivo: string;
    formato: string;
    tamanoBytes: number;
    numeroOperacion: string | null;
    estadoArchivo: 'PENDIENTE' | 'DISPONIBLE';
    confirmadoEn: string | null;
  };
  motivos: string[];
  pedido: { codigo: string } | null;
}
export interface ConsultaRecepcion {
  recepcion: RecepcionCompra;
  correccion?: {
    solicitudId: string;
    mensaje: string;
    pendiente: boolean;
    versionEsperada: number;
  };
}
export interface OperacionCompra extends ConsultaRecepcion {
  operacion: { claveSolicitud: string; estado: 'CONFIRMADA' | 'PENDIENTE' };
  resultado: 'PEDIDO_CREADO' | 'REQUIERE_ATENCION' | 'ADJUNTAR_COMPROBANTE' | null;
}
export const UUID_COMPRA = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function idCompra(v: unknown): string {
  const s = texto(v);
  if (!UUID_COMPRA.test(s)) throw Error('Referencia de compra inválida.');
  return s;
}
function entero(v: unknown, min = 1): number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > 4294967295)
    throw Error('Versión inválida.');
  return v as number;
}
function booleano(v: unknown): boolean {
  if (typeof v !== 'boolean') throw Error('Estado inválido.');
  return v;
}
function fecha(v: unknown): string {
  const s = texto(v);
  if (!Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s)
    throw Error('Fecha inválida.');
  return s;
}
function importe(v: unknown): string {
  centimos(v);
  return texto(v);
}
export function adaptarMetodosCompra(v: unknown): MetodosCheckout {
  const d = registro(v);
  if (!Array.isArray(d['metodos']) || d['metodos'].length > 2) throw Error('Métodos inválidos.');
  const metodos = d['metodos'].map((v) => {
    const m = registro(v),
      metodo = texto(m['metodo']);
    if (!['YAPE', 'PLIN'].includes(metodo) || m['nombre'] !== (metodo === 'YAPE' ? 'Yape' : 'Plin'))
      throw Error('Método inválido.');
    return { metodo: metodo as MetodoCheckout, nombre: texto(m['nombre']) };
  });
  const disponible = booleano(d['disponible']);
  if (
    new Set(metodos.map((m) => m.metodo)).size !== metodos.length ||
    (!disponible && metodos.length)
  )
    throw Error('Métodos incoherentes.');
  return { version: entero(d['version'], 0), disponible, metodos };
}
export function adaptarInstruccionCompra(v: unknown): InstruccionCompra {
  const d = registro(v),
    p = registro(d['preparacion']),
    entrega = registro(p['entrega']),
    contacto = registro(p['contacto']),
    c = registro(p['cotizacion']);
  const ver = registro(d['verificacion']),
    destino = registro(d['destino']);
  if (
    d['versionContrato'] !== 1 ||
    d['moneda'] !== 'PEN' ||
    !['YAPE', 'PLIN'].includes(texto(d['metodo']))
  )
    throw Error('Instrucción inválida.');
  for (const campo of ['nombres', 'apellidos', 'correo']) texto(contacto[campo]);
  for (const campo of ['celular', 'distrito', 'direccion']) texto(entrega[campo]);
  if (
    !Array.isArray(ver['articulos']) ||
    !ver['articulos'].length ||
    ver['articulos'].length > 50 ||
    !Array.isArray(p['articulos'])
  )
    throw Error('Artículos inválidos.');
  const articulos = ver['articulos'].map((v) => {
    const a = registro(v),
      cantidad = entero(a['cantidad']);
    if (cantidad > 100 || centimos(a['importe']) !== centimos(a['precioUnitario']) * cantidad)
      throw Error('Línea de compra incoherente.');
    return {
      sku: texto(a['sku']),
      nombreProducto: texto(a['nombreProducto']),
      color: texto(a['color']),
      talla: texto(a['talla']),
      cantidad,
      precioUnitario: importe(a['precioUnitario']),
      importe: importe(a['importe']),
    };
  });
  const subtotal = centimos(ver['subtotal']),
    costo = centimos(ver['costoEnvio']),
    total = centimos(ver['total']);
  if (
    articulos.reduce((s, a) => s + centimos(a.importe), 0) !== subtotal ||
    subtotal + costo !== total ||
    total !== centimos(d['importeReferencia']) ||
    total !== centimos(c['total']) ||
    costo !== centimos(c['costoEnvio'])
  )
    throw Error('Total de compra incoherente.');
  if (
    new Set(articulos.map((a) => a.sku)).size !== articulos.length ||
    new Set(p['articulos'].map((v) => texto(registro(v)['sku']))).size !== articulos.length ||
    articulos.reduce((s, a) => s + a.cantidad, 0) > 100 ||
    p['articulos'].length !== articulos.length
  )
    throw Error('Artículos repetidos.');
  for (const v of p['articulos']) {
    const a = registro(v),
      linea = articulos.find((l) => l.sku === a['sku']);
    if (
      !linea ||
      linea.cantidad !== a['cantidad'] ||
      centimos(a['precioUnitarioEsperado']) !== centimos(linea.precioUnitario)
    )
      throw Error('Preparación incoherente.');
  }
  const celular = texto(destino['celular']),
    titular = texto(destino['titular']);
  if (!/^9\d{8}$/.test(celular) || !titular.trim()) throw Error('Receptor inválido.');
  let qr: InstruccionCompra['destino']['qr'] = null;
  if (destino['qr'] !== null) {
    const q = registro(destino['qr']),
      url = new URL(texto(q['url']));
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      url.username ||
      url.password ||
      url.port ||
      !['png', 'jpg', 'webp'].includes(texto(q['formato']))
    )
      throw Error('QR inválido.');
    qr = {
      id: idCompra(q['id']),
      url: url.href,
      formato: texto(q['formato']),
      ancho: entero(q['ancho']),
      alto: entero(q['alto']),
    };
  }
  const plazo = ver['plazoEntrega'] === null ? null : texto(ver['plazoEntrega']);
  if (c['plazoEntrega'] !== plazo) throw Error('Plazo incoherente.');
  return {
    versionContrato: 1,
    instruccionId: idCompra(d['instruccionId']),
    claveCreacionPedido: idCompra(d['claveCreacionPedido']),
    metodo: d['metodo'] as MetodoCheckout,
    versionConfiguracion: entero(d['versionConfiguracion']),
    emitidaEn: fecha(d['emitidaEn']),
    moneda: 'PEN',
    importeReferencia: importe(d['importeReferencia']),
    preparacion: p as unknown as PreparacionCompra,
    verificacion: {
      distritoNombre: texto(ver['distritoNombre']),
      subtotal: importe(ver['subtotal']),
      costoEnvio: importe(ver['costoEnvio']),
      plazoEntrega: plazo,
      total: importe(ver['total']),
      articulos,
    },
    destino: { celular, titular, qr },
    accesoExpiraEn: d['accesoExpiraEn'] === null ? null : fecha(d['accesoExpiraEn']),
  };
}
export function adaptarRecepcionCompra(v: unknown): ConsultaRecepcion {
  const raiz = registro(v),
    d = registro(raiz['recepcion']),
    c = registro(d['comprobante']);
  const instruccion = adaptarInstruccionCompra(d['instruccion']);
  if (
    d['versionContrato'] !== 1 ||
    !['RECIBIENDO', 'RECIBIDA', 'REQUIERE_ATENCION', 'PEDIDO_CREADO'].includes(
      texto(d['estado']),
    ) ||
    !/^REC-[A-Z0-9-]+$/.test(texto(d['referencia'])) ||
    d['claveCreacionPedido'] !== instruccion.claveCreacionPedido ||
    !Array.isArray(d['motivos']) ||
    !d['motivos'].every((m) => typeof m === 'string')
  )
    throw Error('Recepción inválida.');
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(texto(c['formato'])) ||
    !['PENDIENTE', 'DISPONIBLE'].includes(texto(c['estadoArchivo']))
  )
    throw Error('Comprobante inválido.');
  const pedido = d['pedido'] === null ? null : { codigo: texto(registro(d['pedido'])['codigo']) };
  if (
    (pedido && !CODIGO_PEDIDO.test(pedido.codigo)) ||
    (d['estado'] === 'PEDIDO_CREADO') !== !!pedido
  )
    throw Error('Pedido incoherente.');
  const numeroOperacion = c['numeroOperacion'] === null ? null : texto(c['numeroOperacion']);
  if (numeroOperacion !== null && !/^\d{1,12}$/.test(numeroOperacion))
    throw Error('Operación inválida.');
  const recepcion: RecepcionCompra = {
    versionContrato: 1,
    id: idCompra(d['id']),
    referencia: texto(d['referencia']),
    claveSolicitud: idCompra(d['claveSolicitud']),
    claveCreacionPedido: instruccion.claveCreacionPedido,
    estado: d['estado'] as RecepcionCompra['estado'],
    version: entero(d['version']),
    creadoEn: fecha(d['creadoEn']),
    recibidaEn: d['recibidaEn'] === null ? null : fecha(d['recibidaEn']),
    accesoExpiraEn: d['accesoExpiraEn'] === null ? null : fecha(d['accesoExpiraEn']),
    instruccion,
    comprobante: {
      id: idCompra(c['id']),
      version: entero(c['version']),
      nombreArchivo: texto(c['nombreArchivo']),
      formato: texto(c['formato']),
      tamanoBytes: entero(c['tamanoBytes']),
      numeroOperacion,
      estadoArchivo: c['estadoArchivo'] as 'PENDIENTE' | 'DISPONIBLE',
      confirmadoEn: c['confirmadoEn'] === null ? null : fecha(c['confirmadoEn']),
    },
    motivos: d['motivos'] as string[],
    pedido,
  };
  if (raiz['correccion'] === undefined) return { recepcion };
  const cor = registro(raiz['correccion']);
  return {
    recepcion,
    correccion: {
      solicitudId: idCompra(cor['solicitudId']),
      mensaje: texto(cor['mensaje']),
      pendiente: booleano(cor['pendiente']),
      versionEsperada: entero(cor['versionEsperada']),
    },
  };
}
export function adaptarOperacionCompra(v: unknown): OperacionCompra {
  const d = registro(v),
    op = registro(d['operacion']),
    consulta = adaptarRecepcionCompra(v);
  if (
    !['CONFIRMADA', 'PENDIENTE'].includes(texto(op['estado'])) ||
    ![null, 'PEDIDO_CREADO', 'REQUIERE_ATENCION', 'ADJUNTAR_COMPROBANTE'].includes(
      d['resultado'] as null,
    )
  )
    throw Error('Operación inválida.');
  if ((op['estado'] === 'PENDIENTE') !== (d['resultado'] === null))
    throw Error('Resultado incoherente.');
  return {
    ...consulta,
    operacion: {
      claveSolicitud: idCompra(op['claveSolicitud']),
      estado: op['estado'] as 'CONFIRMADA' | 'PENDIENTE',
    },
    resultado: d['resultado'] as OperacionCompra['resultado'],
  };
}
