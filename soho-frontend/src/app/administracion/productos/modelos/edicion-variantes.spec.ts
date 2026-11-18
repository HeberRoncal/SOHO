import { PRODUCTOS_ADMIN_PRUEBA } from '../pruebas/productos.fixtures';
import {
  COLORES_VARIANTES,
  errorColores,
  planVariantes,
  skuVariante,
  validarVariantes,
} from './edicion-variantes';
import { editarDatosProducto, validarEdicionProducto } from './edicion-producto';

describe('Generación de variantes administrativas', () => {
  const original = PRODUCTOS_ADMIN_PRUEBA[0];
  it('omite una combinación existente aunque su SKU sea anterior o esté deshabilitada', () => {
    const existente = { ...original.variantes[0], habilitada: false };
    const plan = planVariantes(
      original.codigoInterno,
      original.colores,
      [existente.talla, '40.5'],
      [existente],
    );
    expect(plan[0]).toMatchObject({ existe: true, sku: existente.sku });
    expect(plan[1]).toMatchObject({ existe: false, sku: original.codigoInterno + '-BN-40P5' });
    expect(skuVariante('SHO-0013', 'AZ', '40.5')).toBe('SHO-0013-AZ-40P5');
  });
  it('detecta códigos, nombres y SKU ocupados antes de generar', () => {
    const blanco = COLORES_VARIANTES[0];
    expect(errorColores([blanco, { ...blanco, nombre: 'Otro blanco' }])).toContain('códigos');
    expect(errorColores([blanco, { ...blanco, codigo: 'ZZ', nombre: ' BLÁNCO ' }])).toContain(
      'nombres',
    );
    expect(errorColores([{ ...blanco, codigo: 'A1' }])).toContain('dos letras');
    expect(planVariantes('SHO-0013', [blanco], ['40'], [], ['SHO-0013-BL-40'])[0].colision).toBe(
      true,
    );
  });
  it('permite habilitar y agregar variantes, conserva las guardadas y valida el stock inicial', () => {
    const nueva = {
      identificador: 'SHO-0001-BN-40P5',
      sku: 'SHO-0001-BN-40P5',
      codigoColor: 'BN',
      talla: '40.5',
      sistemaTallas: 'EU' as const,
      existencias: 3,
      cantidadReservada: 0,
      habilitada: true,
    };
    const edicion = {
      colores: original.colores,
      variantes: [...original.variantes.map((v) => ({ ...v, habilitada: false })), nueva],
    };
    expect(
      validarVariantes(edicion, original.codigoInterno, PRODUCTOS_ADMIN_PRUEBA, original),
    ).toBe('');
    for (const existencias of [-1, 1.5, NaN, Infinity, 100000])
      expect(
        validarVariantes(
          { ...edicion, variantes: [...original.variantes, { ...nueva, existencias }] },
          original.codigoInterno,
          PRODUCTOS_ADMIN_PRUEBA,
          original,
        ),
      ).toContain('stock inicial');
    expect(
      validarVariantes(
        { ...edicion, variantes: [nueva] },
        original.codigoInterno,
        PRODUCTOS_ADMIN_PRUEBA,
        original,
      ),
    ).toContain('No se pueden');
    expect(
      validarVariantes(
        { ...edicion, variantes: original.variantes.map((v) => ({ ...v, existencias: 100 })) },
        original.codigoInterno,
        PRODUCTOS_ADMIN_PRUEBA,
        original,
      ),
    ).toContain('movimientos');
    expect(
      validarVariantes(
        { ...edicion, colores: original.colores.map((c) => ({ ...c, codigo: 'ZZ' })) },
        original.codigoInterno,
        PRODUCTOS_ADMIN_PRUEBA,
        original,
      ),
    ).toContain('colores guardados');
  });
  it('valida la publicación con las variantes del formulario, incluidas las nuevas', () => {
    const datos = {
      ...editarDatosProducto(original),
      nombre: 'Modelo nuevo',
      codigoModelo: 'NUEVO',
    };
    const color = COLORES_VARIANTES[0];
    const nueva = {
      identificador: 'SHO-0013-BL-40',
      sku: 'SHO-0013-BL-40',
      codigoColor: color.codigo,
      talla: '40',
      sistemaTallas: 'EU' as const,
      existencias: 0,
      cantidadReservada: 0,
      habilitada: true,
    };
    expect(
      validarEdicionProducto(
        datos,
        'publicado',
        PRODUCTOS_ADMIN_PRUEBA,
        undefined,
        { colores: [color], variantes: [nueva] },
        'SHO-0013',
      ),
    ).toEqual({});
    expect(
      validarEdicionProducto(
        editarDatosProducto(original),
        'publicado',
        PRODUCTOS_ADMIN_PRUEBA,
        original,
        {
          colores: original.colores,
          variantes: original.variantes.map((v) => ({ ...v, habilitada: false })),
        },
        original.codigoInterno,
      ).variantes,
    ).toContain('activa');
  });
});
