const LOGOTIPOS_MARCAS: Readonly<Record<string, string>> = {
  adidas: 'Logo ADIDAS.svg',
  asics: 'Logo ASICS.svg',
  converse: 'Logo CONVERSE.svg',
  newbalance: 'Logo NEW BALANCE.svg',
  nike: 'Logo NIKE.svg',
  puma: 'Logo PUMA.svg',
  reebok: 'Logo REEBOK.svg',
  skechers: 'Logo SKECHERS.svg',
  underarmour: 'Logo UNDERARMOUR.svg',
  vans: 'Logo VANS.svg',
};

export function logotipoMarca(nombre: string, anterior = ''): string {
  const archivo = LOGOTIPOS_MARCAS[nombre.toLowerCase().replace(/[^a-z0-9]/g, '')];
  return archivo ? '/imagenes/marcas/' + archivo : anterior;
}

export const MARCAS_CON_LOGOTIPO = [
  'Nike',
  'adidas',
  'Puma',
  'New Balance',
  'Converse',
  'Vans',
  'ASICS',
  'Reebok',
  'Skechers',
  'Under Armour',
].map((nombre) => ({ nombre, logotipo: logotipoMarca(nombre) }));
