import { Marca } from '../modelos/marca';
import { logotipoMarca } from '../datos/logotipos-marcas';
export const MARCAS_CATALOGO_PRUEBA: readonly Marca[] = [
  {
    nombre: 'Nike',
    codigo: 'NK',
    logotipo: logotipoMarca('Nike'),
    altoLogotipo: 30,
  },
  {
    nombre: 'adidas',
    codigo: 'AD',
    logotipo: logotipoMarca('adidas'),
    altoLogotipo: 46,
  },
  {
    nombre: 'Puma',
    codigo: 'PM',
    logotipo: logotipoMarca('Puma'),
    altoLogotipo: 44,
  },
  {
    nombre: 'New Balance',
    codigo: 'NB',
    logotipo: logotipoMarca('New Balance'),
    altoLogotipo: 36,
  },
  {
    nombre: 'Converse',
    codigo: 'CV',
    logotipo: logotipoMarca('Converse'),
    altoLogotipo: 40,
  },
  {
    nombre: 'Vans',
    codigo: 'VN',
    logotipo: logotipoMarca('Vans'),
    altoLogotipo: 28,
  },
];
