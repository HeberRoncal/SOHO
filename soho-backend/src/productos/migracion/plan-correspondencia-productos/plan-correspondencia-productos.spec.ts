import { randomUUID } from 'node:crypto';
import { PlanCorrespondenciaProductos } from './plan-correspondencia-productos.js';
import type { ProductoAnteriorCorrespondencia } from '../modelos-correspondencia/modelos-correspondencia.interface.js';

function producto(codigoInterno = 'SHO-0007'): ProductoAnteriorCorrespondencia {
  const imagen = (ruta: string, orden = 0) => ({
    id: randomUUID(),
    ruta,
    textoAlternativo: ruta,
    orden,
  });
  return {
    id: randomUUID(),
    slug: 'nike-modelo',
    codigoInterno,
    codigoModelo: 'AF107',
    modelo: 'Air Force 1',
    nombre: 'Nike Air Force 1',
    estado: 'PUBLICADO',
    precio: '529.90',
    precioAnterior: null,
    marcaId: randomUUID(),
    marca: { codigo: 'NK' },
    grupoModeloId: null,
    actualizadoEn: '2026-11-15T01:00:00.000Z',
    imagenes: [imagen('/blanco.jpg'), imagen('/campana.jpg', 1)],
    colores: ['BL', 'NG'].map((codigo, orden) => ({
      id: randomUUID(),
      codigo,
      nombre: codigo === 'BL' ? 'Blanco' : 'Negro',
      hexadecimal: '#FFFFFF',
      orden,
      imagenes: [imagen(codigo === 'BL' ? '/blanco.jpg' : '/negro.jpg')],
      variantes: [
        {
          id: randomUUID(),
          sku: 'NK-AF107-' + codigo + '-40P5',
          tallaId: randomUUID(),
          talla: { valor: '40.5' },
          existencias: 1,
          cantidadReservada: 3,
          habilitada: true,
          productoId: null,
          actualizadoEn: '2026-11-15T01:00:00.000Z',
        },
      ],
    })),
  };
}
const crear = (productos: ProductoAnteriorCorrespondencia[]) =>
  new PlanCorrespondenciaProductos().crear({ version: 1, productos });
describe('Plan de correspondencia sin escrituras', () => {
  it('conserva identidad principal, SKU 40P5 y reservas mayores que stock', () => {
    const p = producto(),
      antes = structuredClone(p),
      plan = crear([p]);
    expect(p).toEqual(antes);
    expect(plan.aptoParaRevision).toBe(true);
    expect(plan.productos[0]).toMatchObject({
      productoDestinoId: p.id,
      codigoInterno: 'SHO-0007',
      slug: p.slug,
    });
    expect(plan.productos[1]).toMatchObject({
      codigoInterno: 'SHO-0008',
      codigoColor: 'NG',
    });
    expect(plan.productos[0].variantes[0]).toMatchObject({
      id: p.colores[0].variantes[0].id,
      sku: 'NK-AF107-BL-40P5',
      existencias: 1,
      cantidadReservada: 3,
    });
  });
  it('es determinista ante relectura y orden diferente de filas o claves JSON', () => {
    const p = producto(),
      uno = crear([p]),
      dos = structuredClone(p);
    dos.colores.reverse();
    dos.imagenes.reverse();
    expect(
      new PlanCorrespondenciaProductos().crear({
        productos: [dos],
        version: 1,
      }),
    ).toEqual(uno);
  });
  it('asigna desde el máximo global incluso con productos archivados', () => {
    const p = producto(),
      otro = producto('SHO-9999');
    otro.estado = 'ARCHIVADO';
    otro.colores = [];
    otro.slug = 'otro';
    otro.nombre = 'Otro';
    otro.codigoModelo = 'OTRO';
    expect(crear([p, otro]).productos[1].codigoInterno).toBe('SHO-10000');
  });
  it('conserva borradores sin marca, modelo ni colores', () => {
    const p = producto();
    Object.assign(p, {
      estado: 'BORRADOR',
      marcaId: null,
      marca: null,
      modelo: null,
      codigoModelo: null,
      colores: [],
      precio: null,
    });
    const plan = crear([p]);
    expect(plan.aptoParaRevision).toBe(true);
    expect(plan.productos[0].codigoColor).toBeNull();
  });
  it('separa fotos por color y las asociaciones de una foto general compartida', () => {
    const p = producto(),
      plan = crear([p]);
    expect(plan.productos[0].galeria.map((i) => i.ruta)).toEqual([
      '/blanco.jpg',
      '/campana.jpg',
    ]);
    expect(plan.productos[1].galeria.map((i) => i.ruta)).toEqual([
      '/negro.jpg',
      '/campana.jpg',
    ]);
    expect(plan.productos[0].galeria[0].imagenAnteriorId).toBe(
      p.colores[0].imagenes[0].id,
    );
    expect(plan.productos[0].galeria[1].id).not.toBe(
      plan.productos[1].galeria[1].id,
    );
    expect(plan.productos[0].galeria[1].archivoId).not.toBe(
      plan.productos[1].galeria[1].archivoId,
    );
  });
  it('no trunca galerías desbordadas', () => {
    const p = producto();
    for (let n = 0; n < 9; n++)
      p.imagenes.push({
        id: randomUUID(),
        ruta: '/extra-' + n,
        textoAlternativo: '',
        orden: n + 2,
      });
    const plan = crear([p]);
    expect(plan.aptoParaRevision).toBe(false);
    expect(plan.productos[0].galeria.length).toBeGreaterThan(8);
  });
  it('detecta slug de un color adicional ocupado por otra ficha', () => {
    const p = producto(),
      otro = producto('SHO-0009');
    otro.slug = p.slug + '-negro';
    otro.nombre = 'Otro';
    otro.codigoModelo = 'OTRO';
    expect(
      crear([p, otro]).incidencias.some((i) => i.codigo === 'COLISION_SLUG'),
    ).toBe(true);
  });
  it('no fusiona modelos que colisionan', () => {
    const p = producto(),
      otro = producto('SHO-0009');
    otro.slug = 'otro';
    otro.nombre = 'Otro';
    otro.marcaId = p.marcaId;
    expect(
      crear([p, otro]).incidencias.some((i) => i.codigo === 'COLISION_MODELO'),
    ).toBe(true);
  });
  it.each(['SHO-0000', 'PRES-001', 'SHO-00007', 'SHO-4294967296'])(
    'requiere revisión para código interno %s',
    (codigo) => {
      expect(
        crear([producto(codigo)]).incidencias.some(
          (i) => i.codigo === 'CODIGO_INTERNO_REVISAR',
        ),
      ).toBe(true);
    },
  );
  it('detecta una conversión parcial y el contador agotado', () => {
    const p = producto('SHO-4294967295');
    p.colores[0].variantes[0].productoId = p.id;
    expect(crear([p]).incidencias.map((i) => i.codigo)).toEqual(
      expect.arrayContaining(['CONVERSION_INICIADA', 'CONTADOR_AGOTADO']),
    );
  });
  it('conserva SKU heredados aunque no coincidan con el formato nuevo', () => {
    const p = producto();
    p.colores[0].variantes[0].sku = 'LEGADO-001';
    expect(crear([p]).productos[0].variantes[0].sku).toBe('LEGADO-001');
  });
  it('detecta SKU y tallas repetidos', () => {
    const p = producto();
    p.colores[0].variantes.push({
      ...p.colores[0].variantes[0],
      id: randomUUID(),
    });
    expect(crear([p]).incidencias.map((i) => i.codigo)).toEqual(
      expect.arrayContaining(['COLISION_SKU', 'COLISION_TALLA_PRODUCTO']),
    );
  });
  it('genera un alias explícito para Negro', () => {
    const p = producto(),
      plan = crear([p]);
    expect(plan.alias).toContainEqual({
      slugAnterior: p.slug,
      codigoColor: 'NG',
      productoDestinoId: plan.productos[1].productoDestinoId,
    });
  });
  it('la huella detecta cambios de stock y precio', () => {
    const p = producto(),
      antes = crear([p]);
    p.colores[0].variantes[0].existencias++;
    expect(crear([p]).huellaOrigen).not.toBe(antes.huellaOrigen);
    p.precio = '600.00';
    expect(crear([p]).huellaOrigen).not.toBe(antes.huellaOrigen);
  });
  it('rechaza una entrada mal formada', () => {
    expect(() =>
      new PlanCorrespondenciaProductos().crear({ version: 1, productos: [{}] }),
    ).toThrow();
  });
});
