import { TestBed } from '@angular/core/testing';
import {
  ProductosAdministracionPrueba as ProductosAdministracion,
  proveerProductosAdministracionPrueba,
} from './productos-administracion.fixture';
import { CatalogoPrueba } from '../../../tienda/catalogo/pruebas/catalogo.fixture';
import { EDICION_PRODUCTO_VACIA, editarDatosProducto } from '../modelos/edicion-producto';
import { COLORES_VARIANTES } from '../modelos/edicion-variantes';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerProductosAdministracionPrueba()] });
});

describe('ProductosAdministracion', () => {
  let service: ProductosAdministracion;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProductosAdministracion);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
  it('archiva y restaura como borrador sin alterar el catálogo público ni sus variantes', () => {
    const original = service.productos().find((p) => p.identificador === 'af1')!;
    expect(service.restaurar('af1')).toBe(false);
    expect(service.archivar('af1')).toBe(true);
    expect(service.productos().find((p) => p.identificador === 'af1')?.estado).toBe('archivado');
    expect(service.productos().find((p) => p.identificador === 'af1')?.variantes).toBe(
      original.variantes,
    );
    expect(TestBed.inject(CatalogoPrueba).obtener('af1')?.publicado).toBe(true);
    expect(service.restaurar('af1')).toBe(true);
    expect(service.productos().find((p) => p.identificador === 'af1')?.estado).toBe('borrador');
    service.restablecer();
    expect(service.productos().find((p) => p.identificador === 'af1')?.estado).toBe('publicado');
  });
  it('mantiene los contadores sincronizados y rechaza identificadores desconocidos', () => {
    const antes = service.resumen();
    expect(service.archivar('desconocido')).toBe(false);
    service.archivar('af1');
    expect(service.resumen().publicados).toBe(antes.publicados - 1);
    expect(service.resumen().archivados).toBe(antes.archivados + 1);
    expect(service.resumen().variantes).toBe(antes.variantes);
  });
  it('crea borradores con identificadores únicos y conserva los datos solo durante la visita', () => {
    const antes = service.productos().length;
    const primero = service.guardar(
      { ...EDICION_PRODUCTO_VACIA, nombre: 'Nuevo modelo A' },
      'borrador',
    ).producto!;
    const segundo = service.guardar(
      { ...EDICION_PRODUCTO_VACIA, nombre: 'Nuevo modelo B' },
      'borrador',
    ).producto!;
    expect(primero.identificador).not.toBe(segundo.identificador);
    expect(primero.codigoInterno).not.toBe(segundo.codigoInterno);
    expect(primero.variantes).toEqual([]);
    expect(service.productos().length).toBe(antes + 2);
    expect(
      service.guardar({ ...EDICION_PRODUCTO_VACIA, nombre: 'Nuevo modelo A' }, 'borrador').producto,
    ).toBeNull();
    service.restablecer();
    expect(service.productos().length).toBe(antes);
  });
  it('edita el precio común y los datos sin regenerar SKU ni cambiar stock, colores o catálogo público', () => {
    const original = service.productos().find((p) => p.identificador === 'af1')!;
    const publico = TestBed.inject(CatalogoPrueba).obtener('af1')!;
    const editado = service.guardar(
      {
        ...editarDatosProducto(original),
        nombre: 'AF1 edición de prueba',
        precio: '499,90',
        precioAnterior: '599.90',
        codigoModelo: 'AF1-EDIT',
      },
      'publicado',
      'af1',
    ).producto!;
    expect(editado.precio).toBe(499.9);
    expect(editado.precioAnterior).toBe(599.9);
    expect(editado.codigoInterno).toBe(original.codigoInterno);
    expect(editado.variantes).toBe(original.variantes);
    expect(editado.colores).toBe(original.colores);
    expect(TestBed.inject(CatalogoPrueba).obtener('af1')).toBe(publico);
    expect(
      service.guardar(editarDatosProducto(original), 'borrador', 'inexistente').producto,
    ).toBeNull();
  });
  it('guarda variantes nuevas y cambios de habilitación en la copia administrativa', () => {
    const original = service.productos()[0];
    const color = COLORES_VARIANTES.find((c) => c.codigo === 'AZ')!;
    const sku = original.codigoInterno + '-AZ-40P5';
    const nueva = {
      identificador: sku,
      sku,
      codigoColor: color.codigo,
      talla: '40.5',
      sistemaTallas: 'EU' as const,
      existencias: 7,
      cantidadReservada: 0,
      habilitada: true,
    };
    const variantes = [...original.variantes.map((v) => ({ ...v, habilitada: false })), nueva];
    const editado = service.guardar(
      editarDatosProducto(original),
      'publicado',
      original.identificador,
      { colores: [...original.colores, color], variantes },
    ).producto!;
    expect(editado.variantes.at(-1)).toEqual(nueva);
    expect(editado.variantes[0]).toEqual({ ...original.variantes[0], habilitada: false });
    expect(original.variantes[0].habilitada).toBe(true);
    expect(service.resumen().variantes).toBe(176);
    const invalido = service.guardar(
      editarDatosProducto(editado),
      'borrador',
      editado.identificador,
      {
        colores: editado.colores,
        variantes: editado.variantes.map((v) => ({ ...v, cantidadReservada: 0, existencias: 500 })),
      },
    );
    expect(invalido.producto).toBeNull();
    expect(service.productos()[0]).toBe(editado);
  });
});
