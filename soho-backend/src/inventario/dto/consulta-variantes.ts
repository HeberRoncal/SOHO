import { BadRequestException } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { idProducto } from '../../productos/dto/consulta-productos.js';
export class ConsultaVariantes {
  static leer(valor: unknown) {
    const q = objeto(valor, [
      'busqueda',
      'sku',
      'producto',
      'pagina',
      'limite',
    ]);
    const texto = (v: unknown, max: number) => {
      if (v === undefined) return '';
      if (typeof v !== 'string' || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v))
        throw new BadRequestException('Filtros de inventario inválidos.');
      return v.trim();
    };
    const entero = (v: unknown, def: number, max: number) => {
      if (v === undefined) return def;
      if (typeof v !== 'string' || !/^[1-9]\d{0,5}$/.test(v) || Number(v) > max)
        throw new BadRequestException('Paginación inválida.');
      return Number(v);
    };
    return {
      busqueda: texto(q.busqueda, 120),
      sku: texto(q.sku, 96),
      producto:
        q.producto === undefined || q.producto === ''
          ? ''
          : idProducto(q.producto).toLowerCase(),
      pagina: entero(q.pagina, 1, 100000),
      limite: entero(q.limite, 20, 50),
    };
  }
}
