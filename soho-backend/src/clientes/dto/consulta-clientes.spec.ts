import {
  identidadCliente,
  leerClientes,
  leerPaginaClientes,
} from './consulta-clientes.js';
describe('Contratos de consulta de Clientes', () => {
  it('define límites y valores predeterminados sin forzar estados de pantalla', () => {
    expect(leerClientes({})).toEqual({
      busqueda: '',
      tipo: '',
      orden: 'recientes',
      pagina: 1,
      limite: 20,
    });
    expect(
      leerClientes({
        busqueda: ' Ana ',
        tipo: 'invitado',
        orden: 'pedidos',
        pagina: '100000',
        limite: '50',
      }),
    ).toEqual({
      busqueda: 'Ana',
      tipo: 'invitado',
      orden: 'pedidos',
      pagina: 100000,
      limite: 50,
    });
  });
  it.each([
    null,
    [],
    'texto',
    { extra: '1' },
    { vista: 'vacio' },
    { tipo: 'ADMIN' },
    { tipo: '' },
    { orden: 'asc' },
    { busqueda: ['Ana', 'Otra'] },
    { busqueda: {} },
    { busqueda: 'x'.repeat(121) },
    { busqueda: 'Ana\u200B' },
    { busqueda: 'a\nb' },
    { pagina: '0' },
    { pagina: '-1' },
    { pagina: '01' },
    { pagina: '1.5' },
    { pagina: '100001' },
    { limite: '51' },
    { limite: 20 },
    { limite: ['1', '2'] },
  ])('rechaza consulta inválida %j', (valor) => {
    expect(() => leerClientes(valor)).toThrow();
  });
  it('mantiene los signos y comodines como texto, no como consulta vacía', () => {
    expect(leerClientes({ busqueda: ' ++++ ' }).busqueda).toBe('++++');
    expect(leerClientes({ busqueda: '%_\\' }).busqueda).toBe('%_\\');
  });
  it('historial y direcciones admiten solo paginación', () => {
    expect(leerPaginaClientes({})).toEqual({ pagina: 1, limite: 20 });
    expect(() => leerPaginaClientes({ busqueda: 'Ana' })).toThrow();
  });
  it('distingue cuenta y compra invitada, normalizando UUID', () => {
    const id = 'abcdef01-1234-4321-8123-123456789abc';
    expect(identidadCliente(id.toUpperCase())).toEqual({
      id,
      tipo: 'registrado',
      identificador: id,
    });
    expect(identidadCliente('invitado:' + id)).toEqual({
      id,
      tipo: 'invitado',
      identificador: 'invitado:' + id,
    });
  });
  it.each([
    null,
    [],
    {},
    'invitado:correo@prueba.test',
    'invitado:',
    'cliente:abcdef01-1234-4321-8123-123456789abc',
    'CLI-000001',
    'abcdef01-1234-4321-8123-123456789abc ',
  ])('rechaza identidades inválidas %j', (valor) => {
    expect(() => identidadCliente(valor)).toThrow();
  });
});
