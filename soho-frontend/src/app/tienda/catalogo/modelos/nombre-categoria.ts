const NOMBRES_CATEGORIA_TIENDA: Readonly<Record<string, string>> = {
  Clásicos: 'Urbanas',
  'Para correr': 'Running/Gym',
  Patineta: 'Básquet',
  Urbano: 'Skate',
  'Uso diario': 'Clásicos',
};

export function nombreCategoriaTienda(nombre: string): string {
  return NOMBRES_CATEGORIA_TIENDA[nombre] ?? nombre;
}
