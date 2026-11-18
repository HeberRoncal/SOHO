import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import {
  CONFIGURACION_AUTH,
  crearConfiguracionAuth,
} from '../src/autenticacion/seguridad/configuracion-auth.js';
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { EscrituraPedidoService } from '../src/pedidos/seguridad/escritura-pedido.service.js';
import type { RespuestaPedido } from '../src/pedidos/dto/respuesta-pedido.js';
import { datosPedido } from './pedidos-fixtures.js';
import { RecuperacionReservasService } from '../src/pedidos/reservas/recuperacion-reservas.service.js';
import { VencimientosReservasService } from '../src/pedidos/reservas/vencimientos-reservas.service.js';
import { CancelacionesPedidosService } from '../src/pedidos/cancelaciones/cancelaciones-pedidos.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Pedidos requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url);
const prefijo = `rec-${randomBytes(5).toString('hex')}`,
  origen = 'http://localhost:4200',
  ruta = '/api/pedidos';
const clave = 'contraseña sintética de pedidos';
const idsUsuarios: string[] = [],
  idsVariantes: string[] = [],
  tallasCreadas: string[] = [];
type Navegador = {
  cliente: ReturnType<typeof request.agent>;
  csrf: string;
  acceso?: string;
};

describe.sequential('Recuperación de reservas con HTTP y MySQL aislado', () => {
  let app: INestApplication,
    privado: string,
    propietario: Navegador,
    admin: Navegador;
  let productoId: string,
    colorId: string,
    marcaId: string,
    categoriaId: string,
    sku: string,
    skuOtro: string;
  let zonas: Awaited<ReturnType<typeof prisma.zonaEntrega.findMany>>;
  let politica: NonNullable<
    Awaited<ReturnType<typeof prisma.configuracionReserva.findUnique>>
  >;
  const invitado = async (): Promise<Navegador> => {
    const cliente = request.agent(app.getHttpServer());
    const csrf = await cliente.get('/api/auth/csrf').expect(200);
    return {
      cliente,
      csrf: csrf.body.csrfToken as string,
      acceso: randomBytes(32).toString('hex'),
    };
  };
  const enviar = (n: Navegador, d: object) => {
    const solicitud = n.cliente
      .post(ruta)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf);
    if (n.acceso) solicitud.set('X-Pedido-Acceso', n.acceso);
    return solicitud.send(d);
  };
  const get = (n: Navegador, destino: string) => {
    const solicitud = n.cliente.get(destino);
    return n.acceso ? solicitud.set('X-Pedido-Acceso', n.acceso) : solicitud;
  };
  const nuevo = () => datosPedido(sku);
  const pedidosPropios = () =>
    prisma.pedido.findMany({
      where: { articulos: { some: { varianteId: { in: idsVariantes } } } },
    });
  beforeAll(async () => {
    privado = await mkdtemp(join(tmpdir(), 'soho-pedidos-api-test-'));
    zonas = await prisma.zonaEntrega.findMany();
    politica = await prisma.configuracionReserva.findUniqueOrThrow({
      where: { id: 1 },
    });
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({}))
      .overrideProvider(ConfiguracionPedidos)
      .useValue(
        new ConfiguracionPedidos({ PEDIDOS_DIRECTORIO_PRIVADO: privado }),
      )
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: vi.fn() })
      .compile();
    app = modulo.createNestApplication({ bodyParser: false });
    app.use(cuerpoJsonGeneral());
    await app.init();
    marcaId = (
      await prisma.marca.create({
        data: {
          codigo: randomBytes(4).toString('hex'),
          nombre: `${prefijo} marca`,
          slug: `${prefijo}-marca`,
        },
      })
    ).id;
    categoriaId = (
      await prisma.categoria.create({
        data: {
          nombre: `${prefijo} categoría`,
          slug: `${prefijo}-categoria`,
        },
      })
    ).id;
    productoId = (
      await prisma.producto.create({
        data: {
          slug: prefijo,
          codigoInterno: prefijo,
          codigoModelo: prefijo,
          nombre: `${prefijo} zapatilla`,
          modelo: 'Modelo de prueba',
          precio: '99.99',
          estado: 'PUBLICADO',
          marcaId,
          categoriaId,
          imagenes: { create: { ruta: '/imagenes/prueba.webp', orden: 0 } },
        },
      })
    ).id;
    colorId = (
      await prisma.productoColor.create({
        data: {
          productoId,
          codigo: 'BL',
          nombre: 'Blanco',
          hexadecimal: '#FFFFFF',
        },
      })
    ).id;
    for (const valor of [40, 41]) {
      let talla = await prisma.talla.findUnique({
        where: { sistema_valor: { sistema: 'EU', valor } },
      });
      if (!talla) {
        talla = await prisma.talla.create({ data: { valor } });
        tallasCreadas.push(talla.id);
      }
      const variante = await prisma.variante.create({
        data: {
          productoColorId: colorId,
          tallaId: talla.id,
          sku: `${prefijo}-BL-${valor}`,
          existencias: 5,
        },
      });
      idsVariantes.push(variante.id);
      if (valor === 40) sku = variante.sku;
      else skuOtro = variante.sku;
    }
    const claveHash = await new ClavesService().crear(clave);
    const navegadores: Navegador[] = [];
    for (const rol of ['CLIENTE', 'CLIENTE', 'ADMIN'] as const) {
      const usuario = await prisma.usuario.create({
        data: {
          nombres: 'Ana',
          apellidos: 'Prueba',
          correo: `${prefijo}-${idsUsuarios.length}@pedidos.test`,
          claveHash,
          rol,
        },
      });
      idsUsuarios.push(usuario.id);
      const n = await invitado();
      const sesion = await n.cliente
        .post('/api/auth/login')
        .set('Origin', origen)
        .set('X-CSRF-Token', n.csrf)
        .send({ correo: usuario.correo, clave })
        .expect(200);
      navegadores.push({
        cliente: n.cliente,
        csrf: sesion.body.csrfToken as string,
      });
    }
    [propietario, , admin] = navegadores;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (!productoId) return;
    const ids = (await pedidosPropios()).map((p) => p.id);
    await prisma.movimientoInventario.deleteMany({
      where: { envioPedido: { pedidoId: { in: ids } } },
    });
    await prisma.cancelacionPedido.deleteMany({
      where: { pedidoId: { in: ids } },
    });
    await prisma.envioPedido.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.eventoPedido.deleteMany({
      where: { pedidoId: { in: ids } },
    });
    await prisma.reservaInventario.deleteMany({
      where: { articulo: { pedidoId: { in: ids } } },
    });
    await prisma.pedidoArticuloUnidad.deleteMany({
      where: { articulo: { pedidoId: { in: ids } } },
    });
    await prisma.comprobantePago.deleteMany({
      where: { pago: { pedidoId: { in: ids } } },
    });
    await prisma.pagoPedido.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.pedidoFacturacion.deleteMany({
      where: { pedidoId: { in: ids } },
    });
    await prisma.pedidoArticulo.deleteMany({
      where: { pedidoId: { in: ids } },
    });
    await prisma.pedido.deleteMany({ where: { id: { in: ids } } });
    await prisma.variante.updateMany({
      where: { id: { in: idsVariantes } },
      data: { existencias: 5, cantidadReservada: 0, habilitada: true },
    });
    await prisma.producto.update({
      where: { id: productoId },
      data: {
        estado: 'PUBLICADO',
        precio: '99.99',
        nombre: `${prefijo} zapatilla`,
      },
    });
    await prisma.marca.update({
      where: { id: marcaId },
      data: { activa: true },
    });
    await prisma.categoria.update({
      where: { id: categoriaId },
      data: { activa: true },
    });
    if (!(await prisma.imagenProducto.count({ where: { productoId } })))
      await prisma.imagenProducto.create({
        data: { productoId, ruta: '/imagenes/prueba.webp', orden: 0 },
      });
    for (const z of zonas)
      await prisma.zonaEntrega.update({
        where: { id: z.id },
        data: {
          tarifa: z.tarifa,
          plazo: z.plazo,
          habilitada: z.habilitada,
          actualizadoEn: z.actualizadoEn,
        },
      });
    await prisma.configuracionReserva.update({
      where: { id: 1 },
      data: {
        modo: politica.modo,
        horas: politica.horas,
        accionVencimiento: politica.accionVencimiento,
        accionCancelacion: politica.accionCancelacion,
        version: politica.version,
      },
    });
    await prisma.usuario.updateMany({
      where: { id: { in: idsUsuarios } },
      data: { activo: true },
    });
    await prisma.usuario.update({
      where: { id: idsUsuarios[2] },
      data: { rol: 'ADMIN' },
    });
    await prisma.usuario.update({
      where: { id: idsUsuarios[1] },
      data: { rol: 'CLIENTE' },
    });
    await prisma.sesion.updateMany({
      where: { usuarioId: { in: idsUsuarios } },
      data: {
        revocadaEn: null,
        expiraEn: new Date(Date.now() + 3_600_000),
        ultimaActividadEn: new Date(),
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await prisma.sesion.deleteMany({
      where: { usuarioId: { in: idsUsuarios } },
    });
    await prisma.usuario.deleteMany({ where: { id: { in: idsUsuarios } } });
    await prisma.variante.deleteMany({ where: { id: { in: idsVariantes } } });
    if (colorId)
      await prisma.productoColor.deleteMany({ where: { id: colorId } });
    if (productoId) {
      await prisma.imagenProducto.deleteMany({ where: { productoId } });
      await prisma.producto.deleteMany({ where: { id: productoId } });
    }
    if (marcaId) await prisma.marca.deleteMany({ where: { id: marcaId } });
    if (categoriaId)
      await prisma.categoria.deleteMany({ where: { id: categoriaId } });
    await prisma.talla.deleteMany({ where: { id: { in: tallasCreadas } } });
    await prisma.$disconnect();
    if (privado) await rm(privado, { recursive: true, force: true });
  });

  type Pedido = RespuestaPedido;
  const ver = async (p: Pick<Pedido, 'codigo'>) =>
    (await get(admin, `/api/admin/pedidos/${p.codigo}`).expect(200)).body
      .pedido as Awaited<
      ReturnType<CancelacionesPedidosService['cancelar']>
    >['pedido'];
  const crear = async (dos = false, n = propietario): Promise<Pedido> => {
    const d = await nuevo();
    if (dos) {
      d.articulos.push({ ...d.articulos[0], sku: skuOtro });
      d.cotizacion.total = '399.96';
    }
    return (await enviar(n, d).expect(201)).body.pedido as Pedido;
  };
  const revisar = (p: Pedido, accion = 'APROBADO', n = admin) =>
    n.cliente
      .post(`/api/admin/pagos/${p.codigo}/decision`)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send({
        versionPedido: p.version,
        versionPago: p.pago!.version,
        comprobanteId: p.pago!.comprobantes.at(-1)!.id,
        accion,
        ...(accion === 'APROBADO'
          ? { confirmado: true }
          : {
              motivo: 'ILEGIBLE',
              mensaje: 'Adjunta una captura completa y legible.',
              ...(accion === 'OBSERVADO'
                ? { solicitud: 'CORREGIDO' }
                : { confirmado: true }),
            }),
      });
  const cancelar = (p: Pedido, extras: object = {}, n = admin) =>
    n.cliente
      .post(`/api/admin/pedidos/${p.codigo}/cancelacion`)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send({
        versionPedido: p.version,
        versionPago: p.pago!.version,
        confirmado: true,
        motivo: 'Solicitud privada del cliente de cancelar.',
        ...extras,
      });
  const liberar = (p: Pedido, extras: object = {}, n = admin) =>
    n.cliente
      .post(`/api/admin/pedidos/${p.codigo}/cancelacion/liberar-reservas`)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send({
        versionPedido: p.version,
        versionPago: p.pago!.version,
        confirmado: true,
        ...extras,
      });
  const politicaPedido = (p: Pedido, politica: 'LIBERAR' | 'PREGUNTAR') =>
    prisma.reservaInventario.updateMany({
      where: { articulo: { pedido: { codigo: p.codigo } }, estado: 'ACTIVA' },
      data: { accionCancelacion: politica },
    });
  const preparar = async (p: Pedido) =>
    (
      await admin.cliente
        .post(`/api/admin/pedidos/${p.codigo}/preparacion`)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send({ versionPedido: p.version })
        .expect(200)
    ).body.pedido as Pedido;
  const despachar = (p: Pedido, n = admin) =>
    n.cliente
      .post(`/api/admin/pedidos/${p.codigo}/envio`)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send({
        versionPedido: p.version,
        transportista: 'Reparto SOHO',
        referenciaSeguimiento: '000123',
      });
  const stock = () =>
    prisma.variante.findMany({
      where: { id: { in: idsVariantes } },
      orderBy: { id: 'asc' },
      select: { id: true, existencias: true, cantidadReservada: true },
    });
  const servicio = () => app.get(VencimientosReservasService);
  const reservas = (p: Pick<Pedido, 'codigo'>) =>
    prisma.reservaInventario.findMany({
      where: { articulo: { pedido: { codigo: p.codigo } } },
      orderBy: { id: 'asc' },
    });
  const vencer = async (
    p: Pedido,
    accion: 'LIBERAR_Y_ALERTAR' | 'SOLO_ALERTAR' = 'LIBERAR_Y_ALERTAR',
    futuro = false,
  ) => {
    const venceEn = new Date(Date.now() + (futuro ? 3600000 : -3600000));
    await prisma.reservaInventario.updateMany({
      where: { articulo: { pedido: { codigo: p.codigo } }, estado: 'ACTIVA' },
      data: {
        modo: 'TIEMPO',
        horas: 1,
        accionVencimiento: accion,
        creadoEn: new Date(venceEn.getTime() - 3600000),
        venceEn,
        configuracionVersion: 42,
      },
    });
  };
  const eventosVencidos = (p: Pedido) =>
    prisma.eventoPedido.findMany({
      where: { pedido: { codigo: p.codigo }, tipo: 'RESERVA_VENCIDA' },
      orderBy: { secuencia: 'asc' },
    });

  const motivoRecuperacion =
    'Cliente confirma que continuaremos con el pedido.';
  const entrada = (p: Pedido, extras = {}) => ({
    versionPedido: p.version,
    versionPago: p.pago!.version,
    confirmado: true as const,
    motivo: motivoRecuperacion,
    ...extras,
  });
  const recuperar = (p: Pedido, extras = {}, n = admin) =>
    n.cliente
      .post(`/api/admin/pedidos/${p.codigo}/reservas/recuperacion`)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send(entrada(p, extras));
  const consultar = (p: Pedido, n = admin) =>
    get(n, `/api/admin/pedidos/${p.codigo}/reservas/recuperacion`);
  const vencido = async (dos = false, observado = false, n = propietario) => {
    let p = await crear(dos, n);
    if (observado)
      p = (await revisar(p, 'OBSERVADO').expect(201)).body.pedido as Pedido;
    await vencer(p);
    await servicio().procesarPedido(p.codigo);
    return ver(p);
  };
  const filtroVencidos = () =>
    get(admin, '/api/admin/pedidos?reserva=vencida').expect(200);

  it.each([false, true])(
    'recupera todas las líneas y conserva pago observado=%s, datos e historial',
    async (observado) => {
      const p = await vencido(true, observado),
        antiguas = await reservas(p),
        previo = await stock();
      const consulta = await consultar(p).expect(200);
      expect(consulta.body.recuperacion).toMatchObject({
        puedeRecuperar: true,
        versionPedido: p.version,
        versionPago: p.pago!.version,
      });
      expect(consulta.body.recuperacion.articulos).toHaveLength(2);
      expect(await reservas(p)).toEqual(antiguas);
      const resultado = (await recuperar(p).expect(200)).body
        .pedido as typeof p;
      expect(resultado.version).toBe(p.version + 1);
      expect(resultado.estadoEntrega).toBe('PENDIENTE');
      expect(resultado.pago).toEqual(p.pago);
      for (const campo of [
        'contacto',
        'entrega',
        'subtotal',
        'descuento',
        'total',
        'costoEnvio',
        'facturacion',
      ] as const)
        expect(resultado[campo]).toEqual(p[campo]);
      expect(resultado.recuperacionReservas.ultima).toMatchObject({
        motivo: motivoRecuperacion,
        versionPedido: resultado.version,
        responsable: { id: idsUsuarios[2] },
      });
      const actuales = await reservas(p);
      expect(
        actuales.filter((r) => antiguas.some((a) => a.id === r.id)),
      ).toEqual(antiguas);
      for (const r of actuales.filter((r) => r.estado === 'ACTIVA')) {
        const anterior = antiguas.find(
          (a) => a.pedidoArticuloId === r.pedidoArticuloId,
        )!;
        expect(r).toMatchObject({
          cantidad: anterior.cantidad,
          modo: anterior.modo,
          horas: anterior.horas,
          configuracionVersion: 42,
          accionVencimiento: anterior.accionVencimiento,
          accionCancelacion: anterior.accionCancelacion,
          vencimientoAtendidoEn: null,
          cerradaEn: null,
          motivoCierre: null,
        });
        expect(r.creadoEn.getTime()).toBeGreaterThanOrEqual(
          anterior.cerradaEn!.getTime(),
        );
        expect(r.venceEn!.getTime()).toBe(
          r.creadoEn.getTime() + r.horas! * 3600000,
        );
      }
      expect((await stock()).map((v) => v.existencias)).toEqual(
        previo.map((v) => v.existencias),
      );
      expect((await stock()).every((v) => v.cantidadReservada === 2)).toBe(
        true,
      );
      expect(await prisma.movimientoInventario.count()).toBe(0);
      expect(resultado.vencimientoReservas.unidadesLiberadas).toBe(0);
      expect((await filtroVencidos()).body.paginacion.total).toBe(0);
      await recuperar(p).expect(409);
      expect(await reservas(p)).toHaveLength(4);
    },
  );

  it('permite revisar, aprobar, preparar y despachar después de recuperar sin otro descuento', async () => {
    const p = await vencido();
    const r = (await recuperar(p).expect(200)).body.pedido as Pedido;
    let aprobado = (await revisar(r).expect(201)).body.pedido as Pedido;
    expect(aprobado.estadoEntrega).toBe('CONFIRMADO');
    aprobado = await preparar(aprobado);
    await despachar(aprobado).expect(200);
    expect(await servicio().procesarPedido(p.codigo)).toBe(0);
    expect((await stock()).find((v) => v.id === idsVariantes[0])).toMatchObject(
      { existencias: 3, cantidadReservada: 0 },
    );
    expect(await prisma.movimientoInventario.count()).toBe(1);
  });

  it('conserva las reservas activas de otras líneas y sus alertas SOLO_ALERTAR', async () => {
    const p = await crear(true);
    await vencer(p);
    const [primera, segunda] = await reservas(p);
    await prisma.reservaInventario.update({
      where: { id: segunda.id },
      data: { accionVencimiento: 'SOLO_ALERTAR' },
    });
    await servicio().procesarPedido(p.codigo);
    const actual = await ver(p);
    const mantenida = (await reservas(p)).find((r) => r.id === segunda.id)!;
    const consulta = (await consultar(actual).expect(200)).body.recuperacion;
    expect(consulta.articulos).toHaveLength(1);
    expect(consulta.unidadesConservadas).toBe(2);
    const r = (await recuperar(actual).expect(200)).body
      .pedido as typeof actual;
    expect(r.vencimientoReservas).toEqual({
      unidadesLiberadas: 0,
      unidadesConservadas: 2,
    });
    expect((await reservas(p)).find((r) => r.id === segunda.id)).toEqual(
      mantenida,
    );
    expect(
      (await reservas(p)).filter((r) => r.estado === 'ACTIVA'),
    ).toHaveLength(2);
    expect((await filtroVencidos()).body.paginacion.total).toBe(1);
    expect((await reservas(p)).find((r) => r.id === primera.id)!.estado).toBe(
      'LIBERADA',
    );
  });

  it('si falta stock en una línea no recupera parcialmente ni modifica versiones o historial', async () => {
    const p = await vencido(true),
      antes = await reservas(p);
    await prisma.variante.update({
      where: { id: idsVariantes[1] },
      data: { existencias: 1 },
    });
    const plan = (await consultar(p).expect(200)).body.recuperacion;
    expect(plan.puedeRecuperar).toBe(false);
    expect(
      plan.articulos.some(
        (a: { cantidad: number; disponibles: number }) =>
          a.disponibles < a.cantidad,
      ),
    ).toBe(true);
    await recuperar(p).expect(409);
    expect(await reservas(p)).toEqual(antes);
    expect((await ver(p)).version).toBe(p.version);
    expect((await stock()).every((v) => v.cantidadReservada === 0)).toBe(true);
  });

  it('respeta stock reservado por otro pedido y disponibilidad cambiada después de consultar', async () => {
    const p = await vencido();
    await consultar(p).expect(200);
    const otroPedido = await crear();
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { existencias: 3 },
    });
    await recuperar(p).expect(409);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(2);
    expect((await reservas(otroPedido))[0].estado).toBe('ACTIVA');
    expect((await reservas(p)).every((r) => r.estado === 'LIBERADA')).toBe(
      true,
    );
  });

  it('no recupera variantes deshabilitadas ni inventario desconciliado', async () => {
    const p = await vencido();
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { habilitada: false },
    });
    expect(
      (await consultar(p).expect(200)).body.recuperacion.puedeRecuperar,
    ).toBe(false);
    await recuperar(p).expect(409);
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { habilitada: true, cantidadReservada: 1 },
    });
    await consultar(p).expect(409);
    await recuperar(p).expect(409);
    expect(await reservas(p)).toHaveLength(1);
  });

  it.each(['APROBADO', 'RECHAZADO', 'ANULADO'] as const)(
    'excluye pagos %s sin reescribir su estado',
    async (estado) => {
      const p = await vencido();
      await prisma.pagoPedido.updateMany({
        where: { pedido: { codigo: p.codigo } },
        data: { estado },
      });
      await recuperar(await ver(p)).expect(409);
      expect((await ver(p)).pago!.estado).toBe(estado);
      expect(await reservas(p)).toHaveLength(1);
    },
  );

  it('excluye cancelaciones con reservas conservadas y no las reactiva', async () => {
    const p = await crear();
    await politicaPedido(p, 'PREGUNTAR');
    await vencer(p);
    const c = (
      await cancelar(p, { decisionReservasConsultadas: 'CONSERVAR' }).expect(
        200,
      )
    ).body.pedido as Pedido;
    await recuperar(c).expect(409);
    expect((await reservas(p))[0].estado).toBe('ACTIVA');
    await liberar(c).expect(200);
  });

  it('excluye una incidencia manual sin prueba de liberación automática', async () => {
    const p = await crear();
    await prisma.pedido.update({
      where: { codigo: p.codigo },
      data: { estadoEntrega: 'INCIDENCIA' },
    });
    await revisar(await ver(p)).expect(409);
    await recuperar(await ver(p)).expect(409);
    expect(
      (await consultar(p).expect(200)).body.recuperacion.puedeRecuperar,
    ).toBe(false);
  });

  it('exige ADMIN, sesión, CSRF, confirmación y motivo sin exponer datos internos', async () => {
    const n = await invitado(),
      p = await vencido(false, false, n);
    await consultar(p, propietario).expect(403);
    await recuperar(p, {}, propietario).expect(403);
    await request(app.getHttpServer())
      .get(`/api/admin/pedidos/${p.codigo}/reservas/recuperacion`)
      .expect(401);
    await admin.cliente
      .post(`/api/admin/pedidos/${p.codigo}/reservas/recuperacion`)
      .send(entrada(p))
      .expect(403);
    for (const extras of [
      { confirmado: false },
      { motivo: '' },
      { horas: 24 },
      { estado: 'PENDIENTE' },
      { versionPedido: p.version - 1 },
    ])
      await recuperar(p, extras).expect('versionPedido' in extras ? 409 : 400);
    const publico = (await get(n, `/api/pedidos/${p.codigo}`).expect(200)).body
      .pedido;
    expect(publico).not.toHaveProperty('recuperacionReservas');
    expect(publico).not.toHaveProperty('eventosInternos');
  });

  it('dos administradores concurrentes recuperan una sola vez', async () => {
    const p = await vencido(true);
    const r = await Promise.all([recuperar(p), recuperar(p)]);
    expect(r.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      (await reservas(p)).filter((r) => r.estado === 'ACTIVA'),
    ).toHaveLength(2);
    expect((await stock()).every((v) => v.cantidadReservada === 2)).toBe(true);
    expect((await ver(p)).version).toBe(p.version + 1);
  });

  it('reserva las últimas unidades entre dos pedidos sin sobreasignarlas', async () => {
    const p = await vencido(),
      segundo = await vencido();
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { existencias: 2 },
    });
    const r = await Promise.all([recuperar(p), recuperar(segundo)]);
    expect(r.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(2);
  });

  it('rollback después de la segunda creación conserva todo el estado anterior', async () => {
    const p = await vencido(true),
      antes = await reservas(p),
      escritura = app.get(EscrituraPedidoService),
      original = escritura.transaccion.bind(escritura);
    vi.spyOn(escritura, 'transaccion').mockImplementationOnce((operacion) =>
      original(async (tx) => {
        await operacion(tx);
        throw Error('fallo antes de COMMIT');
      }),
    );
    // Invocar el servicio evita que la captura HTTP oculte el fallo deliberado.
    const sesion = await prisma.sesion.findFirstOrThrow({
      where: { usuarioId: idsUsuarios[2] },
      include: { usuario: true },
    });
    await expect(
      app
        .get(RecuperacionReservasService)
        .recuperar(p.codigo, entrada(p), {
          sesionId: sesion.id,
          usuario: {
            id: sesion.usuario.id,
            nombres: 'Ana',
            apellidos: 'Prueba',
            correo: sesion.usuario.correo,
            rol: 'ADMIN',
            correoVerificado: false,
          },
        }),
    ).rejects.toThrow('antes de COMMIT');
    expect(await reservas(p)).toEqual(antes);
    expect((await ver(p)).version).toBe(p.version);
    expect((await stock()).every((v) => v.cantidadReservada === 0)).toBe(true);
    await recuperar(p).expect(200);
  });

  it('un COMMIT sin respuesta se comprueba por GET y no vuelve a crear reservas', async () => {
    const p = await vencido(),
      escritura = app.get(EscrituraPedidoService),
      original = escritura.transaccion.bind(escritura);
    vi.spyOn(escritura, 'transaccion').mockImplementationOnce(
      async (operacion) => {
        await original(operacion);
        throw Error('respuesta perdida tras COMMIT');
      },
    );
    await recuperar(p).expect(500);
    const actual = await ver(p);
    expect(actual.recuperacionReservas.ultima!.motivo).toBe(motivoRecuperacion);
    expect(actual.version).toBe(p.version + 1);
    await recuperar(p).expect(409);
    expect(await reservas(p)).toHaveLength(2);
  });

  it('un segundo vencimiento y recuperación no suman alertas históricas ni duplican cantidades', async () => {
    const p = await vencido();
    const primero = (await recuperar(p).expect(200)).body.pedido as Pedido;
    await vencer(primero);
    await servicio().procesarPedido(p.codigo);
    const segundo = await ver(p);
    expect(segundo.vencimientoReservas.unidadesLiberadas).toBe(2);
    expect((await filtroVencidos()).body.paginacion.total).toBe(1);
    const recuperado = (await recuperar(segundo).expect(200)).body
      .pedido as typeof segundo;
    expect(recuperado.vencimientoReservas.unidadesLiberadas).toBe(0);
    expect((await filtroVencidos()).body.paginacion.total).toBe(0);
    expect(await reservas(p)).toHaveLength(3);
    expect(await eventosVencidos(p)).toHaveLength(2);
    expect(
      (await reservas(p)).filter((r) => r.estado === 'ACTIVA'),
    ).toHaveLength(1);
  });

  it.each(['cancelar', 'rechazar', 'observar'] as const)(
    'serializa recuperación frente a %s',
    async (accion) => {
      const p = await vencido();
      const r = await Promise.all([
        recuperar(p),
        accion === 'cancelar'
          ? cancelar(p)
          : revisar(p, accion === 'rechazar' ? 'RECHAZADO' : 'OBSERVADO'),
      ]);
      const correcto = r.filter((r) => r.status === 200 || r.status === 201);
      expect(correcto).toHaveLength(1);
      expect(r.some((r) => r.status === 409)).toBe(true);
      const actual = await ver(p),
        activas = (await reservas(p)).filter((r) => r.estado === 'ACTIVA');
      expect(
        (await stock()).find((v) => v.id === idsVariantes[0])!
          .cantidadReservada,
      ).toBe(activas.reduce((s, r) => s + r.cantidad, 0));
      expect(actual.version).toBe(p.version + 1);
    },
  );

  it('bloquea recuperar cuando otra reserva activa acaba de vencer sin procesar', async () => {
    const p = await crear(true);
    await vencer(p, 'LIBERAR_Y_ALERTAR', true);
    const [primera, segunda] = await reservas(p),
      pasado = new Date(Date.now() - 1000);
    await prisma.reservaInventario.update({
      where: { id: primera.id },
      data: { creadoEn: new Date(pasado.getTime() - 3600000), venceEn: pasado },
    });
    await servicio().procesarPedido(p.codigo);
    await prisma.reservaInventario.update({
      where: { id: segunda.id },
      data: { creadoEn: new Date(pasado.getTime() - 3600000), venceEn: pasado },
    });
    const actual = await ver(p);
    await recuperar(actual).expect(409);
    expect(await reservas(p)).toHaveLength(2);
    await servicio().procesarPedido(p.codigo);
    await recuperar(await ver(p)).expect(200);
  });

  it('no recupera pedidos ya en preparación, enviados o con reservas consumidas', async () => {
    const p = await vencido();
    for (const estadoEntrega of [
      'EN_PREPARACION',
      'ENVIADO',
      'ENTREGADO',
    ] as const) {
      await prisma.pedido.update({
        where: { codigo: p.codigo },
        data: { estadoEntrega },
      });
      await recuperar(await ver(p)).expect(409);
    }
    expect(await reservas(p)).toHaveLength(1);
  });

  it('aprobar simultáneamente exige revisar el pago sobre la nueva versión recuperada', async () => {
    const p = await vencido(),
      [recuperado, aprobacion] = await Promise.all([recuperar(p), revisar(p)]);
    expect(recuperado.status).toBe(200);
    expect(aprobacion.status).toBe(409);
    expect((await ver(p)).pago!.estado).toBe('PENDIENTE');
    await revisar(await ver(p)).expect(201);
    expect(
      (await reservas(p)).filter((r) => r.estado === 'ACTIVA'),
    ).toHaveLength(1);
  });

  it('el trabajador no vuelve a liberar el plazo renovado cuando compite con recuperar', async () => {
    const p = await vencido();
    const [atendidas, respuesta] = await Promise.all([
      servicio().procesarPedido(p.codigo),
      recuperar(p),
    ]);
    expect(atendidas).toBe(0);
    expect(respuesta.status).toBe(200);
    expect(
      (await reservas(p)).filter((r) => r.estado === 'ACTIVA'),
    ).toHaveLength(1);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(2);
  });

  it('una corrección de comprobante simultánea conserva las reservas y exige actualizar versiones', async () => {
    const p = await vencido(false, true),
      d = await nuevo();
    const corregir = () =>
      propietario.cliente
        .post(`/api/pedidos/${p.codigo}/comprobantes`)
        .set('Origin', origen)
        .set('X-CSRF-Token', propietario.csrf)
        .send({
          versionPedido: p.version,
          versionPago: p.pago!.version,
          comprobanteId: p.pago!.comprobantes.at(-1)!.id,
          comprobante: d.comprobante,
        });
    const resultados = await Promise.all([recuperar(p), corregir()]);
    expect(
      resultados.filter((r) => [200, 201].includes(r.status)),
    ).toHaveLength(1);
    expect(resultados.some((r) => r.status === 409)).toBe(true);
    const actual = await ver(p);
    expect(actual.version).toBe(p.version + 1);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(
      (await reservas(p))
        .filter((r) => r.estado === 'ACTIVA')
        .reduce((s, r) => s + r.cantidad, 0),
    );
  });

  it('revalida una sesión revocada mientras esperaba su bloqueo antes de reservar', async () => {
    const p = await vencido(),
      sesion = await prisma.sesion.findFirstOrThrow({
        where: { usuarioId: idsUsuarios[2] },
        include: { usuario: true },
      });
    let listo!: () => void, continuar!: () => void, iniciado!: () => void;
    const bloqueado = new Promise<void>((r) => {
        listo = r;
      }),
      permiso = new Promise<void>((r) => {
        continuar = r;
      }),
      entradaSesion = new Promise<void>((r) => {
        iniciado = r;
      });
    const retencion = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM sesiones WHERE id = ${sesion.id} FOR UPDATE`;
        listo();
        await permiso;
        await tx.sesion.update({
          where: { id: sesion.id },
          data: { revocadaEn: new Date() },
        });
      },
      { timeout: 10000 },
    );
    await bloqueado;
    const escritura = app.get(EscrituraPedidoService),
      original = escritura.sesion.bind(escritura);
    vi.spyOn(escritura, 'sesion').mockImplementationOnce(async (...args) => {
      iniciado();
      return original(...args);
    });
    const resultado = expect(
      app
        .get(RecuperacionReservasService)
        .recuperar(p.codigo, entrada(p), {
          sesionId: sesion.id,
          usuario: {
            id: sesion.usuario.id,
            nombres: 'Ana',
            apellidos: 'Prueba',
            correo: sesion.usuario.correo,
            rol: 'ADMIN',
            correoVerificado: false,
          },
        }),
    ).rejects.toMatchObject({ status: 401 });
    try {
      await entradaSesion;
    } finally {
      continuar();
    }
    await retencion;
    await resultado;
    expect(await reservas(p)).toHaveLength(1);
    expect((await stock()).every((v) => v.cantidadReservada === 0)).toBe(true);
  });
});
