import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type InstruccionPago } from '../../generated/prisma/client.js';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { texto } from '../../pedidos/preparacion/datos-preparacion-pedido.js';
import { DatosInstruccionPago } from './datos-instruccion-pago.js';

export class RespuestaInstruccionPago {
  private static entidad(v: unknown) {
    if (
      typeof v !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    )
      throw Error();
    return v;
  }
  private static entero(v: unknown, max: number) {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1 || v > max)
      throw Error();
    return v;
  }
  private static importe(v: unknown) {
    if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/.test(v))
      throw Error();
    return v;
  }
  private static qr(v: unknown) {
    if (v === null) return null;
    const q = objeto(v, ['id', 'url', 'formato', 'ancho', 'alto']);
    if (typeof q.url !== 'string' || q.url.length > 1024) throw Error();
    const u = new URL(q.url);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'res.cloudinary.com' ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash
    )
      throw Error();
    if (!['png', 'jpg', 'webp'].includes(q.formato as string)) throw Error();
    return {
      id: this.entidad(q.id),
      url: q.url,
      formato: q.formato as 'png' | 'jpg' | 'webp',
      ancho: this.entero(q.ancho, 4096),
      alto: this.entero(q.alto, 4096),
    };
  }
  static leer(i: InstruccionPago, accesoInvitadoMs: number) {
    try {
      const q = objeto(i.respuesta, [
        'versionContrato',
        'instruccionId',
        'claveCreacionPedido',
        'metodo',
        'versionConfiguracion',
        'emitidaEn',
        'moneda',
        'importeReferencia',
        'preparacion',
        'verificacion',
        'destino',
        'accesoExpiraEn',
      ]);
      const p = DatosInstruccionPago.preparacion(q.preparacion),
        importe = this.importe(q.importeReferencia);
      const expira =
        i.usuarioId === null
          ? new Date(i.emitidaEn.getTime() + accesoInvitadoMs).toISOString()
          : null;
      if (
        q.versionContrato !== 1 ||
        q.instruccionId !== i.id ||
        q.claveCreacionPedido !== i.claveCreacionPedido ||
        q.metodo !== i.metodo ||
        q.emitidaEn !== i.emitidaEn.toISOString() ||
        q.moneda !== 'PEN' ||
        i.moneda !== 'PEN' ||
        importe !== i.importeReferencia.toFixed(2) ||
        importe !== p.cotizacion.total ||
        q.accesoExpiraEn !== expira ||
        DatosInstruccionPago.huellaPreparacion(p) !== i.preparacionHash
      )
        throw Error();
      const d = objeto(q.destino, ['celular', 'titular', 'qr']);
      if (typeof d.celular !== 'string' || !/^9[0-9]{8}$/.test(d.celular))
        throw Error();
      const titular = texto(d.titular, 1, 120),
        qr = this.qr(d.qr);
      const v = objeto(q.verificacion, [
        'distritoNombre',
        'subtotal',
        'costoEnvio',
        'plazoEntrega',
        'total',
        'articulos',
      ]);
      if (
        !Array.isArray(v.articulos) ||
        v.articulos.length !== p.articulos.length
      )
        throw Error();
      const articulos = v.articulos.map((valor: unknown, n: number) => {
        const a = objeto(valor, [
          'varianteId',
          'productoId',
          'sku',
          'nombreProducto',
          'color',
          'sistemaTalla',
          'talla',
          'cantidad',
          'precioUnitario',
          'importe',
        ]);
        const e = p.articulos[n],
          precio = this.importe(a.precioUnitario),
          bruto = this.importe(a.importe);
        if (
          a.sku !== e.sku ||
          a.cantidad !== e.cantidad ||
          precio !== e.precioUnitarioEsperado ||
          new Prisma.Decimal(precio).mul(e.cantidad).toFixed(2) !== bruto
        )
          throw Error();
        return {
          varianteId: this.entidad(a.varianteId),
          productoId: this.entidad(a.productoId),
          sku: e.sku,
          nombreProducto: texto(a.nombreProducto, 1, 180),
          color: texto(a.color, 1, 80),
          sistemaTalla: texto(a.sistemaTalla, 1, 12),
          talla: texto(a.talla, 1, 8),
          cantidad: e.cantidad,
          precioUnitario: precio,
          importe: bruto,
        };
      });
      const subtotal = this.importe(v.subtotal),
        envio = this.importe(v.costoEnvio),
        total = this.importe(v.total);
      if (
        total !== importe ||
        envio !== p.cotizacion.costoEnvio ||
        v.plazoEntrega !== p.cotizacion.plazoEntrega ||
        articulos
          .reduce((s, a) => s.add(a.importe), new Prisma.Decimal(0))
          .toFixed(2) !== subtotal ||
        new Prisma.Decimal(subtotal).add(envio).toFixed(2) !== total
      )
        throw Error();
      return {
        versionContrato: 1,
        instruccionId: i.id,
        claveCreacionPedido: i.claveCreacionPedido,
        metodo: i.metodo,
        versionConfiguracion: this.entero(q.versionConfiguracion, 4294967295),
        emitidaEn: i.emitidaEn.toISOString(),
        moneda: 'PEN' as const,
        importeReferencia: importe,
        preparacion: p,
        verificacion: {
          distritoNombre: texto(v.distritoNombre, 1, 80),
          subtotal,
          costoEnvio: envio,
          plazoEntrega: p.cotizacion.plazoEntrega,
          total,
          articulos,
        },
        destino: { celular: d.celular, titular, qr },
        accesoExpiraEn: expira,
      };
    } catch {
      throw new ServiceUnavailableException(
        'La instrucción registrada requiere revisión. Conserva su referencia.',
      );
    }
  }
}
