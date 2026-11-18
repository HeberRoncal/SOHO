import { BadRequestException } from '@nestjs/common';
import { DatosCoberturaPipe } from './pipes/datos-cobertura.pipe.js';
import { CodigoZonaPipe } from './pipes/codigo-zona.pipe.js';
import { CoberturaService } from './cobertura.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

const codigos = [
  'la-esperanza',
  'trujillo',
  'el-porvenir',
  'florencia-de-mora',
  'victor-larco',
  'huanchaco',
  'moche',
];
const datos = () => ({
  version: 'a'.repeat(64),
  zonas: codigos.map((codigo) => ({
    codigo,
    tarifa: codigo === 'la-esperanza' ? '0.00' : (null as string | null),
    plazo: null as string | null,
    habilitada: codigo !== 'moche',
  })),
});
describe('Contratos y cotización de cobertura', () => {
  const pipe = new DatosCoberturaPipe();
  it('conserva pendientes nulos, normaliza el plazo y los decimales exactos', () => {
    const entrada = datos();
    entrada.zonas[1].tarifa = '7.2';
    entrada.zonas[1].plazo = ' Dos días ';
    expect(pipe.transform(entrada).zonas[1]).toMatchObject({
      tarifa: '7.20',
      plazo: 'Dos días',
    });
    expect(pipe.transform(datos()).zonas[2].tarifa).toBeNull();
  });
  it.each([
    '-1',
    '1.234',
    '1e2',
    'Infinity',
    'NaN',
    '1000000',
    '01.00',
    '',
    ' 7.00 ',
    '7,25',
    8,
    false,
    undefined,
  ])('rechaza tarifas sin convertir o redondear: %s', (tarifa) => {
    const entrada = datos();
    Object.assign(entrada.zonas[1], { tarifa });
    expect(() => pipe.transform(entrada)).toThrow(BadRequestException);
  });
  it.each([
    null,
    [],
    {},
    { ...datos(), usuarioId: 'otro' },
    { ...datos(), version: '' },
    { ...datos(), zonas: [] },
  ])('rechaza contratos incompletos o atributos ajenos', (entrada) => {
    expect(() => pipe.transform(entrada)).toThrow();
  });
  it.each([
    { codigo: 'Trujillo' },
    { tarifa: null, codigo: 'la-esperanza' },
    { tarifa: '5', codigo: 'la-esperanza' },
    { nombre: 'Otro distrito' },
    { habilitada: 'true' },
    { orden: 0 },
    { plazo: 'x'.repeat(81) },
    { plazo: 'mañana\n' },
  ])('rechaza cambios de zona inválidos: %o', (cambio) => {
    const entrada = datos();
    Object.assign(entrada.zonas[0], cambio);
    expect(() => pipe.transform(entrada)).toThrow();
  });
  it('rechaza distritos repetidos', () => {
    const entrada = datos();
    entrada.zonas[1] = entrada.zonas[0];
    expect(() => pipe.transform(entrada)).toThrow();
  });
  it('código de ruta rechaza espacios, controles y longitud excesiva', () => {
    const codigo = new CodigoZonaPipe();
    for (const valor of [
      '',
      'TRUJILLO',
      'trujillo\n',
      'a'.repeat(81),
      'la--esperanza',
    ])
      expect(() => codigo.transform(valor)).toThrow();
    expect(codigo.transform('victor-larco')).toBe('victor-larco');
  });
  it('nunca convierte una tarifa pendiente a envío gratis', async () => {
    const buscar = vi.fn().mockResolvedValue({
      codigo: 'trujillo',
      habilitada: true,
      tarifa: null,
    });
    const servicio = new CoberturaService({
      zonaEntrega: { findUnique: buscar },
    } as unknown as PrismaService);
    await expect(servicio.cotizar('trujillo')).rejects.toMatchObject({
      response: { codigo: 'COBERTURA_TARIFA_PENDIENTE' },
    });
    buscar.mockResolvedValue({
      codigo: 'la-esperanza',
      nombre: 'La Esperanza',
      habilitada: true,
      tarifa: new Prisma.Decimal('0.00'),
      plazo: null,
    });
    await expect(servicio.cotizar('la-esperanza')).resolves.toMatchObject({
      cotizacion: { costo: '0.00', moneda: 'PEN' },
    });
  });
  function administracion() {
    const zonas = codigos.map((codigo, orden) => ({
      id: codigo,
      codigo,
      nombre: codigo,
      tarifa: orden === 0 ? new Prisma.Decimal(0) : null,
      plazo: null as string | null,
      habilitada: codigo !== 'moche',
      orden,
      creadoEn: new Date('2026-11-17T12:00:00Z'),
      actualizadoEn: new Date('2026-11-17T12:00:00Z'),
    }));
    const tabla = {
      findMany: vi.fn().mockImplementation(async () => zonas),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        Object.assign(
          zonas.find((z) => z.codigo === where.codigo)!,
          data,
          {
            tarifa:
              data.tarifa === null ? null : new Prisma.Decimal(data.tarifa),
          },
        );
      }),
    };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), zonaEntrega: tabla };
    const prisma = {
      zonaEntrega: tabla,
      $transaction: vi.fn().mockImplementation(async (fn) => fn(tx)),
    };
    return {
      servicio: new CoberturaService(prisma as unknown as PrismaService),
      tabla,
    };
  }
  it.each(['tarifa', 'plazo'] as const)(
    'exige deshabilitar antes de modificar %s, incluso si se deshabilita en el mismo envío',
    async (campo) => {
      const { servicio, tabla } = administracion();
      const actual = await servicio.consultarAdministracion();
      const entrada = {
        version: actual.version,
        zonas: actual.zonas.map((z) => ({
          codigo: z.codigo,
          tarifa: z.tarifa,
          plazo: z.plazo,
          habilitada: z.habilitada,
        })),
      };
      Object.assign(entrada.zonas[1], {
        [campo]: campo === 'tarifa' ? '7.25' : 'Mañana',
        habilitada: false,
      });
      await expect(servicio.actualizar(entrada)).rejects.toThrow(
        'Deshabilita primero',
      );
      expect(tabla.update).not.toHaveBeenCalled();
    },
  );
  it('permite deshabilitar, editar y volver a habilitar en pasos confirmados', async () => {
    const { servicio } = administracion();
    let actual = await servicio.consultarAdministracion();
    const solicitud = () => ({
      version: actual.version,
      zonas: actual.zonas.map((z) => ({
        codigo: z.codigo,
        tarifa: z.tarifa,
        plazo: z.plazo,
        habilitada: z.habilitada,
      })),
    });
    let cambio = solicitud();
    cambio.zonas[1].habilitada = false;
    actual = await servicio.actualizar(cambio);
    cambio = solicitud();
    Object.assign(cambio.zonas[1], { tarifa: '7.25', plazo: 'Dos días' });
    actual = await servicio.actualizar(cambio);
    expect(actual.zonas[1]).toMatchObject({
      habilitada: false,
      tarifa: '7.25',
      plazo: 'Dos días',
      cotizable: false,
    });
    cambio = solicitud();
    cambio.zonas[1].habilitada = true;
    actual = await servicio.actualizar(cambio);
    expect(actual.zonas[1]).toMatchObject({
      habilitada: true,
      cotizable: true,
    });
  });
});
