import { Prisma } from '../../generated/prisma/client.js';
import {
  RespuestaInventario,
  type VarianteInventario,
} from './respuesta-inventario.js';
const variante = (): VarianteInventario => ({
  id: 'v',
  sku: 'NK-AF107-BL-40P5',
  productoId: 'p',
  productoColorId: 'c',
  existencias: 5,
  cantidadReservada: 3,
  versionExistencias: 4,
  habilitada: true,
  talla: { valor: new Prisma.Decimal('40.5'), sistema: 'EU' },
  producto: {
    id: 'p',
    nombre: 'Modelo Blanco',
    codigoInterno: 'SHO-001',
    estado: 'BORRADOR',
    codigoColor: 'BL',
    colorNombre: 'Blanco',
    grupoModeloId: 'g',
  },
  productoColor: {
    codigo: 'BL',
    nombre: 'Anterior',
    productoId: 'p',
    producto: {
      id: 'anterior',
      nombre: 'Anterior',
      codigoInterno: 'SHO-ANTERIOR',
      estado: 'ARCHIVADO',
    },
  },
});
describe('Identidad y saldos administrativos', () => {
  it('conserva UUID, SKU decimal y ficha directa', () => {
    expect(RespuestaInventario.variante(variante())).toMatchObject({
      id: 'v',
      sku: 'NK-AF107-BL-40P5',
      producto: { id: 'p', nombre: 'Modelo Blanco', estado: 'borrador' },
      color: { nombre: 'Blanco' },
      talla: '40.5',
      versionExistencias: 4,
      existencias: 5,
      cantidadReservada: 3,
      disponible: 2,
      faltante: 0,
    });
  });
  it('representa déficit sin reducir reservas', () => {
    expect(
      RespuestaInventario.variante({ ...variante(), existencias: 1 }),
    ).toMatchObject({ disponible: 0, faltante: 2, cantidadReservada: 3 });
  });
  it('mantiene disponible cero al deshabilitar', () => {
    expect(
      RespuestaInventario.variante({ ...variante(), habilitada: false }),
    ).toMatchObject({ existencias: 5, disponible: 0 });
  });
  it('admite consultar relaciones anteriores', () => {
    expect(
      RespuestaInventario.variante({
        ...variante(),
        producto: null,
        productoId: null,
      }),
    ).toMatchObject({
      producto: { id: 'anterior', estado: 'archivado' },
      color: { nombre: 'Anterior' },
    });
  });
});
