import { BadRequestException } from '@nestjs/common';
import {
  escaparLike,
  idProducto,
  leerMovimientos,
  leerProductos,
  sinFiltros,
} from './consulta-productos.js';

describe('Contratos de consulta administrativa', () => {
  it('limita las consultas y excluye archivados por defecto', () => {
    expect(leerProductos({})).toMatchObject({
      pagina: 1,
      limite: 20,
      estado: '',
    });
    expect(
      leerProductos({
        estado: 'archivado',
        busqueda: '  NK-AF107  ',
        limite: '50',
      }),
    ).toMatchObject({ estado: 'archivado', busqueda: 'NK-AF107', limite: 50 });
  });
  it.each([
    { limite: '51' },
    { limite: ['20', '50'] },
    { pagina: '0' },
    { pagina: '-1' },
    { pagina: '1.5' },
    { pagina: '100001' },
    { pagina: '1e3' },
    { precio: '10' },
    { estado: 'PUBLICADO' },
    { marca: 'Nike OR 1=1' },
    { disponibilidad: 'todos' },
    { orden: 'id; DROP TABLE productos' },
    { busqueda: 'x\nSQL' },
    { busqueda: 'x'.repeat(121) },
    { marca: {} },
  ])('rechaza una consulta ambigua o inválida: %j', (q) => {
    expect(() => leerProductos(q)).toThrow(BadRequestException);
  });
  it.each([
    { desde: '2026-02-30' },
    { desde: '2026-11-15', hasta: '2026-11-14' },
    { hasta: '14/11/2026' },
    { producto: 'SHO-0001' },
    { tipo: 'borrar' },
    { origen: 'ENVIO_PEDIDO' },
    { sku: ['A', 'B'] },
    { usuarioResponsable: 'otro' },
  ])('rechaza filtros de historial inválidos: %j', (q) => {
    expect(() => leerMovimientos(q)).toThrow(BadRequestException);
  });
  it('conserva un día válido y los caracteres literales de búsqueda', () => {
    expect(
      leerMovimientos({
        desde: '2024-02-29',
        hasta: '2024-02-29',
        origen: 'envio-pedido',
      }),
    ).toMatchObject({
      desde: '2024-02-29',
      hasta: '2024-02-29',
      origen: 'envio-pedido',
    });
    expect(escaparLike('100%_\\')).toBe('100\\%\\_\\\\');
  });
  it('no confunde UUID con slug o SKU y no acepta parámetros en resúmenes', () => {
    expect(() => idProducto('nike-af1')).toThrow(BadRequestException);
    expect(() => sinFiltros({ pagina: '1' })).toThrow(BadRequestException);
    expect(idProducto('12345678-1234-1234-1234-123456789abc')).toBe(
      '12345678-1234-1234-1234-123456789abc',
    );
  });
});
