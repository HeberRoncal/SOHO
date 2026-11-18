import { BadRequestException } from '@nestjs/common';
import { leerConsultaCatalogo } from './consulta-catalogo.dto.js';

describe('Consulta pública de catálogo', () => {
  it('normaliza listas y conserva céntimos y paginación', () => {
    expect(
      leerConsultaCatalogo({
        marca: [' Nike ', 'Nike', 'adidas'],
        genero: 'Hombre',
        talla: '40.5',
        desde: '0.10',
        hasta: '999.99',
        pagina: '2',
        limite: '24',
      }),
    ).toMatchObject({
      marcas: ['Nike', 'adidas'],
      generos: ['Hombre'],
      tallas: ['40.5'],
      desde: '0.10',
      hasta: '999.99',
      pagina: 2,
      limite: 24,
    });
  });
  it.each([
    { desconocido: '1' },
    { pagina: '0' },
    { pagina: '1.5' },
    { limite: '101' },
    { pagina: ['1', '2'] },
    { desde: '-1' },
    { desde: '1.001' },
    { desde: '800', hasta: '200' },
    { orden: 'random' },
    { marca: { nombre: 'Nike' } },
    { genero: 'Otro' },
    { color: 'negro' },
    { talla: '40.3' },
    { talla: '8' },
    { novedades: 'true' },
    { busqueda: 'x'.repeat(121) },
    { marca: Array.from({ length: 21 }, () => 'Nike') },
  ])('rechaza parámetros fuera del contrato: %j', (consulta) => {
    expect(() => leerConsultaCatalogo(consulta)).toThrow(BadRequestException);
  });
});
