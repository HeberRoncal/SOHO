import { Marca } from '../modelos/marca';
import { logotipoMarca } from '../datos/logotipos-marcas';

const marcas = [
  ['adidas', 'AD', 46],
  ['Asics', 'AS', 24],
  ['Converse', 'CV', 40],
  ['New Balance', 'NB', 36],
  ['Nike', 'NK', 30],
  ['Puma', 'PM', 44],
  ['Reebok', 'RB', 24],
  ['Skechers', 'SK', 24],
  ['Under Armour', 'UA', 24],
  ['Vans', 'VN', 28],
] as const;

export const MARCAS_CATALOGO_PRUEBA: readonly Marca[] = marcas.map(
  ([nombre, codigo, altoLogotipo]) => ({
    nombre,
    codigo,
    logotipo: logotipoMarca(nombre),
    altoLogotipo,
  }),
);
