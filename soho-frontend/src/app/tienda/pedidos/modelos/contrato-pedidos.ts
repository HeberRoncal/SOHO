import { Pedido, EstadoPago, EstadoPreparacion, EnvioPedido } from './pedido';
import { Facturacion } from '../../finalizar-compra/modelos/facturacion';

export interface SolicitudPedido {
  claveCreacion: string;
  contacto: { nombres: string; apellidos: string; correo: string };
  entrega: {
    destinatario: string;
    celular: string;
    distrito: string;
    direccion: string;
    referencia: string;
  };
  facturacion?: {
    tipo: 'BOLETA' | 'FACTURA';
    tipoDocumento: 'DNI' | 'CE' | 'PAS' | 'RUC';
    numeroDocumento: string;
    razonSocial?: string;
    domicilioFiscal?: string;
  };
  articulos: Array<{ sku: string; cantidad: number; precioUnitarioEsperado: string }>;
  cotizacion: { costoEnvio: string; plazoEntrega: string | null; total: string };
  metodoPago: 'YAPE' | 'PLIN';
  comprobante: {
    nombreArchivo: string;
    tipoArchivo: string;
    contenidoBase64: string;
    numeroOperacion?: string;
  };
}
export interface ResultadoConsulta {
  correcto: boolean;
  mensaje: string;
}
export interface PaginacionPedidos {
  pagina: number;
  limite: number;
  total: number;
  paginas: number;
}
export const PAGINACION_PEDIDOS: PaginacionPedidos = {
  pagina: 1,
  limite: 20,
  total: 0,
  paginas: 0,
};
export const CODIGO_PEDIDO = /^SOHO-[A-Z0-9]{6,24}$/;
export function registro(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    throw Error('Respuesta de pedidos inválida.');
  return valor as Record<string, unknown>;
}
export const texto = (v: unknown): string => {
  if (typeof v !== 'string') throw Error('Texto inválido.');
  return v;
};
const entero = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max)
    throw Error('Entero inválido.');
  return v as number;
};
export function centimos(v: unknown): number {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/.test(v))
    throw Error('Importe inválido.');
  const [s, c] = v.split('.'),
    n = Number(s) * 100 + Number(c);
  if (!Number.isSafeInteger(n)) throw Error('Importe inválido.');
  return n;
}
const pagos: Record<string, EstadoPago> = {
  PENDIENTE: 'pendiente',
  OBSERVADO: 'observado',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  ANULADO: 'anulado',
};
const entregas: Record<string, EstadoPreparacion> = {
  PENDIENTE: 'pendiente',
  CONFIRMADO: 'confirmado',
  EN_PREPARACION: 'en-preparacion',
  INCIDENCIA: 'incidencia',
  ENVIADO: 'enviado',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
};

export function adaptarEnvio(valor: unknown): EnvioPedido | null {
  if (valor === null || valor === undefined) return null;
  const e = registro(valor);
  const fecha = (v: unknown) => {
    const t = texto(v);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t) ||
      !Number.isFinite(Date.parse(t)) ||
      new Date(t).toISOString() !== t
    )
      throw Error('Fecha de envío inválida.');
    return t;
  };
  const preparacionIniciadaEn = fecha(e['preparacionIniciadaEn']);
  const despachadoEn = e['despachadoEn'] === null ? null : fecha(e['despachadoEn']);
  const entregadoEn = e['entregadoEn'] === null ? null : fecha(e['entregadoEn']);
  const campo = (v: unknown, min: number) => {
    const t = texto(v);
    if (
      Array.from(t).length < min ||
      Array.from(t).length > 80 ||
      t !== t.trim() ||
      /[\p{Cc}\p{Cf}]/u.test(t)
    )
      throw Error('Datos de envío inválidos.');
    return t;
  };
  const transportista = e['transportista'] === null ? null : campo(e['transportista'], 2);
  const referenciaSeguimiento =
    e['referenciaSeguimiento'] === null ? null : campo(e['referenciaSeguimiento'], 3);
  if (
    (despachadoEn === null
      ? transportista !== null || referenciaSeguimiento !== null || entregadoEn !== null
      : transportista === null ||
        referenciaSeguimiento === null ||
        despachadoEn < preparacionIniciadaEn) ||
    (entregadoEn !== null && (!despachadoEn || entregadoEn < despachadoEn))
  )
    throw Error('Etapas de envío incoherentes.');
  return Object.freeze({
    transportista,
    referenciaSeguimiento,
    preparacionIniciadaEn,
    despachadoEn,
    entregadoEn,
  });
}

export function adaptarPedido(valor: unknown): Pedido {
  const p = registro(valor),
    c = registro(p['contacto']),
    e = registro(p['entrega']),
    pago = registro(p['pago']);
  const codigo = texto(p['codigo']),
    fecha = texto(p['fecha']);
  const estadoPago = pagos[texto(pago['estado'])],
    estadoPreparacion = entregas[texto(p['estadoEntrega'])];
  let cancelacion: Pedido['cancelacion'] = null;
  if (p['cancelacion'] != null) {
    const f = texto(registro(p['cancelacion'])['fecha']);
    if (
      estadoPreparacion !== 'cancelado' ||
      !Number.isFinite(Date.parse(f)) ||
      Date.parse(f) < Date.parse(fecha)
    )
      throw Error('Cancelación inválida.');
    // Solo la fecha pertenece al contrato del cliente, aunque lleguen campos privados.
    cancelacion = Object.freeze({ fecha: f });
  }
  if (
    !CODIGO_PEDIDO.test(codigo) ||
    !Number.isFinite(Date.parse(fecha)) ||
    p['moneda'] !== 'PEN' ||
    !Object.hasOwn(pagos, texto(pago['estado'])) ||
    !Object.hasOwn(entregas, texto(p['estadoEntrega'])) ||
    !estadoPago ||
    !estadoPreparacion ||
    !['YAPE', 'PLIN'].includes(texto(pago['metodo'])) ||
    !Array.isArray(p['articulos']) ||
    !p['articulos'].length ||
    !Array.isArray(pago['comprobantes']) ||
    !pago['comprobantes'].length
  )
    throw Error('Pedido inválido.');
  const articulos = p['articulos'].map((v) => {
    const a = registro(v),
      precio = centimos(a['precioUnitario']),
      cantidad = entero(a['cantidad'], 1, 99999);
    if (precio <= 0) throw Error('Precio inválido.');
    return Object.freeze({
      sku: texto(a['sku']),
      nombre: texto(a['nombreProducto']),
      color: texto(a['color']),
      talla: texto(a['talla']),
      imagen: texto(a['imagen']),
      cantidad,
      precioUnitario: precio / 100,
      importe: centimos(a['importeNeto']) / 100,
    });
  });
  const subtotal = centimos(p['subtotal']),
    descuento = centimos(p['descuento']),
    envio = centimos(p['costoEnvio']),
    total = centimos(p['total']);
  if (
    subtotal - descuento + envio !== total ||
    articulos.reduce((s, a) => s + Math.round(a.importe * 100), 0) + envio !== total
  )
    throw Error('Importes de pedido incoherentes.');
  const comprobantes = pago['comprobantes']
    .map((v) => registro(v))
    .sort((a, b) => entero(a['version'], 1) - entero(b['version'], 1));
  const ultimo = comprobantes.at(-1)!,
    id = texto(ultimo['id']),
    formato = texto(ultimo['tipoArchivo']);
  if (!/^[0-9a-f-]{36}$/.test(id) || !['image/png', 'image/jpeg', 'image/webp'].includes(formato))
    throw Error('Comprobante inválido.');
  let facturacion: Facturacion | undefined;
  if (p['facturacion'] !== null) {
    const f = registro(p['facturacion']);
    if (f['tipo'] === 'FACTURA' && f['tipoDocumento'] === 'RUC')
      facturacion = {
        tipo: 'factura',
        documento: 'DNI',
        numero: '',
        ruc: texto(f['numeroDocumento']),
        razonSocial: texto(f['razonSocial']),
        domicilioFiscal: texto(f['domicilioFiscal']),
      };
    else if (f['tipo'] === 'BOLETA' && ['DNI', 'CE', 'PAS'].includes(texto(f['tipoDocumento'])))
      facturacion = {
        tipo: 'boleta',
        documento: f['tipoDocumento'] as 'DNI' | 'CE' | 'PAS',
        numero: texto(f['numeroDocumento']),
        ruc: '',
        razonSocial: '',
        domicilioFiscal: '',
      };
    else throw Error('Facturación inválida.');
  }
  return Object.freeze({
    codigo,
    fecha,
    cancelacion,
    envio: adaptarEnvio(p['envio']),
    version: entero(p['version'], 1),
    versionPago: entero(pago['version'], 1),
    datos: Object.freeze({
      nombres: texto(c['nombres']),
      apellidos: texto(c['apellidos']),
      correo: texto(c['correo']),
      destinatario: texto(e['destinatario']),
      celular: texto(e['celular']),
      distrito: texto(e['distrito']),
      direccion: texto(e['direccion']),
      referencia: texto(e['referencia']),
      ...(facturacion ? { facturacion: Object.freeze(facturacion) } : {}),
    }),
    entrega: Object.freeze({
      distrito: texto(e['distrito']),
      nombreDistrito: texto(e['nombreDistrito']),
      costo: envio / 100,
      plazo: e['plazo'] === null ? null : texto(e['plazo']),
      tarifaReal: true,
    }),
    articulos: Object.freeze(articulos),
    subtotal: subtotal / 100,
    descuento: descuento / 100,
    total: total / 100,
    metodoPago: pago['metodo'] === 'YAPE' ? 'Yape' : 'Plin',
    estadoPago,
    estadoPreparacion,
    comprobante: Object.freeze({
      id,
      nombreArchivo: texto(ultimo['nombreArchivo']),
      tipoArchivo: formato,
      tamanoBytes: entero(ultimo['tamanoBytes'], 1, 5 * 1024 * 1024),
      ...(ultimo['numeroOperacion'] === null
        ? {}
        : { numeroOperacion: texto(ultimo['numeroOperacion']) }),
    }),
    observacionPago: ultimo['mensaje'] === null ? null : texto(ultimo['mensaje']),
  });
}
export function adaptarPaginacion(valor: unknown): PaginacionPedidos {
  const p = registro(valor),
    total = entero(p['total']),
    limite = entero(p['limite'], 1, 50),
    paginas = entero(p['paginas']);
  if (paginas !== Math.ceil(total / limite)) throw Error('Paginación inválida.');
  return { pagina: entero(p['pagina'], 1, 10000), limite, total, paginas };
}
