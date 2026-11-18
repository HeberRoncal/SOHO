import { ZonaEntrega } from '../../../tienda/finalizar-compra/modelos/zona-entrega';

// Tarifas ilustrativas, exclusivas de la revisión de interfaces.
// La configuración real procederá de administración mediante NestJS.
export const COBERTURA_DEMOSTRACION: readonly (ZonaEntrega & { tarifa: number })[] = [
  { codigo: 'la-esperanza', nombre: 'La Esperanza', tarifa: 0, habilitada: true },
  { codigo: 'trujillo', nombre: 'Trujillo', tarifa: 6, habilitada: true },
  { codigo: 'el-porvenir', nombre: 'El Porvenir', tarifa: 5, habilitada: true },
  { codigo: 'florencia-de-mora', nombre: 'Florencia de Mora', tarifa: 5, habilitada: true },
  { codigo: 'victor-larco', nombre: 'Víctor Larco Herrera', tarifa: 8, habilitada: true },
  { codigo: 'huanchaco', nombre: 'Huanchaco', tarifa: 10, habilitada: true },
  { codigo: 'moche', nombre: 'Moche', tarifa: 8, habilitada: false },
];
