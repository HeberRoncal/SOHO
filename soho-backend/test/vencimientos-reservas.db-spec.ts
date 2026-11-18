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
import { VencimientosReservasService } from '../src/pedidos/reservas/vencimientos-reservas.service.js';
import { CancelacionesPedidosService } from '../src/pedidos/cancelaciones/cancelaciones-pedidos.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Pedidos requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url);
const prefijo = `venc-${randomBytes(5).toString('hex')}`,
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

describe.sequential('Vencimientos automáticos con HTTP y MySQL aislado', () => {
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

  it.each([
    ['PENDIENTE', 'LIBERAR_Y_ALERTAR'],
    ['OBSERVADO', 'LIBERAR_Y_ALERTAR'],
    ['PENDIENTE', 'SOLO_ALERTAR'],
    ['OBSERVADO', 'SOLO_ALERTAR'],
  ] as const)(
    'atiende pago %s con política histórica %s sin modificar el pago ni stock físico',
    async (estado, accion) => {
      let p = await crear();
      if (estado === 'OBSERVADO')
        p = (await revisar(p, 'OBSERVADO').expect(201)).body.pedido;
      await vencer(p, accion);
      expect(await servicio().procesarPedido(p.codigo)).toBe(1);
      const actual = await ver(p),
        [r] = await reservas(p),
        [e] = await eventosVencidos(p);
      expect(actual.version).toBe(p.version + 1);
      expect(actual.pago).toEqual(p.pago);
      expect(actual.estadoEntrega).toBe(
        accion === 'SOLO_ALERTAR' ? 'PENDIENTE' : 'INCIDENCIA',
      );
      expect(r.estado).toBe(accion === 'SOLO_ALERTAR' ? 'ACTIVA' : 'LIBERADA');
      expect(r.vencimientoAtendidoEn!.getTime()).toBeGreaterThanOrEqual(
        r.venceEn!.getTime(),
      );
      expect(
        (await stock()).find((v) => v.id === idsVariantes[0]),
      ).toMatchObject({
        existencias: 5,
        cantidadReservada: accion === 'SOLO_ALERTAR' ? 2 : 0,
      });
      expect(e).toMatchObject({
        actor: 'SISTEMA',
        responsableId: null,
        visibilidad: 'INTERNA',
        versionPedido: actual.version,
      });
      expect(e.descripcion).toContain('histórica 42');
      expect(await prisma.movimientoInventario.count()).toBe(0);
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      expect(await eventosVencidos(p)).toHaveLength(1);
      expect((await ver(p)).version).toBe(actual.version);
    },
  );

  it('omite reservas sin plazo y futuras sin marcar atención ni cambiar la versión', async () => {
    const p = await crear();
    expect(await servicio().procesarPedido(p.codigo)).toBe(0);
    await vencer(p, 'LIBERAR_Y_ALERTAR', true);
    expect(await servicio().procesarPedido(p.codigo)).toBe(0);
    expect((await reservas(p))[0].vencimientoAtendidoEn).toBeNull();
    expect((await ver(p)).version).toBe(p.version);
  });

  it.each(['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'] as const)(
    'conserva siempre reservas aprobadas con política %s y permite despacho',
    async (accion) => {
      const p = await crear();
      let aprobado = (await revisar(p).expect(201)).body.pedido as Pedido;
      await vencer(aprobado, accion);
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      expect((await reservas(p))[0]).toMatchObject({
        estado: 'ACTIVA',
        vencimientoAtendidoEn: null,
      });
      aprobado = await preparar(aprobado);
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      const enviado = (await despachar(aprobado).expect(200)).body
        .pedido as Pedido;
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      expect((await reservas(p))[0].estado).toBe('CONSUMIDA');
      expect(await prisma.movimientoInventario.count()).toBe(1);
      await admin.cliente
        .post(`/api/admin/pedidos/${p.codigo}/entrega`)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send({ versionPedido: enviado.version, confirmado: true })
        .expect(200);
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      expect(await eventosVencidos(p)).toHaveLength(0);
    },
  );

  it.each(['pendiente', 'aprobado'] as const)(
    'respeta una cancelación con reservas conservadas y pago %s',
    async (estado) => {
      let p = await crear();
      if (estado === 'aprobado') p = (await revisar(p).expect(201)).body.pedido;
      await politicaPedido(p, 'PREGUNTAR');
      await vencer(p);
      const c = (
        await cancelar(p, { decisionReservasConsultadas: 'CONSERVAR' }).expect(
          200,
        )
      ).body.pedido;
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      expect((await reservas(p))[0]).toMatchObject({
        estado: 'ACTIVA',
        vencimientoAtendidoEn: null,
      });
      expect(
        (await stock()).find((v) => v.id === idsVariantes[0])!
          .cantidadReservada,
      ).toBe(2);
      await liberar(c).expect(200);
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
    },
  );

  it.each(['RECHAZADO', 'ANULADO'] as const)(
    'no atiende el pago %s aunque queden reservas activas',
    async (estado) => {
      const p = await crear();
      await vencer(p);
      await prisma.pagoPedido.updateMany({
        where: { pedido: { codigo: p.codigo } },
        data: { estado },
      });
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      expect((await reservas(p))[0].vencimientoAtendidoEn).toBeNull();
    },
  );

  it('procesa solo artículos vencidos y permite nuevos eventos cuando venza otro artículo', async () => {
    const p = await crear(true);
    await vencer(p, 'SOLO_ALERTAR', true);
    const [primera, segunda] = await reservas(p);
    const pasado = new Date(Date.now() - 1000);
    await prisma.reservaInventario.update({
      where: { id: primera.id },
      data: { creadoEn: new Date(pasado.getTime() - 3600000), venceEn: pasado },
    });
    expect(await servicio().procesarPedido(p.codigo)).toBe(1);
    expect(
      (await reservas(p)).find((r) => r.id === segunda.id)!
        .vencimientoAtendidoEn,
    ).toBeNull();
    await prisma.reservaInventario.update({
      where: { id: segunda.id },
      data: {
        creadoEn: new Date(pasado.getTime() - 3600000),
        venceEn: pasado,
        accionVencimiento: 'LIBERAR_Y_ALERTAR',
      },
    });
    expect(await servicio().procesarPedido(p.codigo)).toBe(1);
    const eventos = await eventosVencidos(p);
    expect(eventos).toHaveLength(2);
    expect(eventos[1].versionPedido).toBe(eventos[0].versionPedido + 1);
    expect((await ver(p)).estadoEntrega).toBe('INCIDENCIA');
  });

  it('dos trabajadores y un reintento concurrentes liberan y alertan exactamente una vez', async () => {
    const p = await crear(true);
    await vencer(p);
    expect(
      (
        await Promise.all([
          servicio().procesarPedido(p.codigo),
          servicio().procesarPedido(p.codigo),
          servicio().procesarPedido(p.codigo),
        ])
      ).sort((a, b) => a - b),
    ).toEqual([0, 0, 2]);
    expect(await eventosVencidos(p)).toHaveLength(2);
    expect(
      (await stock()).every(
        (v) => v.cantidadReservada === 0 && v.existencias === 5,
      ),
    ).toBe(true);
    expect((await ver(p)).version).toBe(p.version + 1);
  });

  it('un fallo tras atender la segunda reserva revierte marcas, eventos, saldos y versión', async () => {
    const p = await crear(true);
    await vencer(p);
    const escritura = app.get(EscrituraPedidoService),
      original = escritura.transaccion.bind(escritura);
    vi.spyOn(escritura, 'transaccion').mockImplementationOnce((operacion) =>
      original(async (tx) => {
        await operacion(tx);
        throw Error('fallo antes del COMMIT');
      }),
    );
    await expect(servicio().procesarPedido(p.codigo)).rejects.toThrow(
      'antes del COMMIT',
    );
    expect(
      (await reservas(p)).every(
        (r) => r.estado === 'ACTIVA' && !r.vencimientoAtendidoEn,
      ),
    ).toBe(true);
    expect(await eventosVencidos(p)).toHaveLength(0);
    expect((await stock()).every((v) => v.cantidadReservada === 2)).toBe(true);
    expect((await ver(p)).version).toBe(p.version);
    expect(await servicio().procesarPedido(p.codigo)).toBe(2);
  });

  it('recupera un COMMIT cuya respuesta se pierde sin volver a liberar ni duplicar eventos', async () => {
    const p = await crear();
    await vencer(p);
    const original = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (...args) => {
      await Reflect.apply(original, prisma, args);
      throw Error('respuesta perdida');
    });
    await expect(servicio().procesarPedido(p.codigo)).rejects.toThrow(
      'respuesta perdida',
    );
    expect(await servicio().procesarPedido(p.codigo)).toBe(0);
    expect(await eventosVencidos(p)).toHaveLength(1);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(0);
  });

  it('no libera el inventario de otro pedido de la misma variante', async () => {
    const p = await crear(),
      otroPedido = await crear();
    await vencer(p);
    await servicio().procesarPedido(p.codigo);
    expect((await stock()).find((v) => v.id === idsVariantes[0])).toMatchObject(
      { existencias: 5, cantidadReservada: 2 },
    );
    expect((await reservas(otroPedido))[0]).toMatchObject({
      estado: 'ACTIVA',
      vencimientoAtendidoEn: null,
    });
  });

  it('no marca atención ni modifica inventario cuando el contador está desconciliado', async () => {
    const p = await crear();
    await vencer(p);
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { cantidadReservada: 1 },
    });
    await expect(servicio().procesarPedido(p.codigo)).rejects.toMatchObject({
      status: 409,
    });
    expect((await reservas(p))[0].vencimientoAtendidoEn).toBeNull();
    expect(await eventosVencidos(p)).toHaveLength(0);
  });

  it('publica alertas internas en resumen, filtro y detalle sin exponerlas al cliente ni invitado', async () => {
    const n = await invitado(),
      p = await crear(false, n);
    await vencer(p, 'SOLO_ALERTAR');
    await servicio().procesarPedido(p.codigo);
    const detalle = await ver(p);
    expect(detalle.vencimientoReservas).toEqual({
      unidadesLiberadas: 0,
      unidadesConservadas: 2,
    });
    const lista = await get(admin, '/api/admin/pedidos?reserva=vencida').expect(
      200,
    );
    expect(lista.body.pedidos.map((r: Pedido) => r.codigo)).toContain(p.codigo);
    const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const resumen = await get(
      admin,
      `/api/admin/resumen-pedidos?desde=${hoy}&hasta=${hoy}`,
    ).expect(200);
    expect(resumen.body.reservasVencidasTotal).toBe(1);
    const publico = await get(n, `/api/pedidos/${p.codigo}`).expect(200);
    expect(publico.body.pedido).not.toHaveProperty('vencimientoReservas');
    expect(publico.body.pedido).not.toHaveProperty('eventosInternos');
    expect(JSON.stringify(publico.body)).not.toContain(
      'configuración histórica',
    );
    await get(propietario, '/api/admin/pedidos?reserva=vencida').expect(403);
    await get(admin, '/api/admin/pedidos?reserva=otra').expect(400);
    const aprobado = (await revisar(detalle).expect(201)).body.pedido as Pedido;
    expect(
      (await get(admin, '/api/admin/pedidos?reserva=vencida').expect(200)).body
        .paginacion.total,
    ).toBe(0);
    expect(await servicio().procesarPedido(p.codigo)).toBe(0);
    expect((await reservas(aprobado))[0].estado).toBe('ACTIVA');
  });

  it('bloquea aprobar una reserva liberada y rechaza formularios previos al vencimiento', async () => {
    const p = await crear();
    await vencer(p);
    await servicio().procesarPedido(p.codigo);
    await revisar(p).expect(409);
    await revisar(await ver(p)).expect(409);
    await revisar(await ver(p), 'RECHAZADO').expect(201);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(0);
  });

  it.each(['cancelar', 'rechazar', 'observar'] as const)(
    'serializa vencimiento y %s sin descontar dos veces',
    async (accion) => {
      const p = await crear();
      await vencer(p);
      const resultados = await Promise.all([
        servicio().procesarPedido(p.codigo),
        accion === 'cancelar'
          ? cancelar(p)
          : revisar(p, accion === 'rechazar' ? 'RECHAZADO' : 'OBSERVADO'),
      ]);
      const respuesta = resultados[1] as Awaited<ReturnType<typeof cancelar>>;
      if (respuesta.status === 409) {
        const actual = await ver(p);
        if (accion === 'cancelar') await cancelar(actual).expect(200);
        else
          await revisar(
            actual,
            accion === 'rechazar' ? 'RECHAZADO' : 'OBSERVADO',
          ).expect(201);
      } else expect([200, 201]).toContain(respuesta.status);
      expect(
        (await stock()).find((v) => v.id === idsVariantes[0]),
      ).toMatchObject({ existencias: 5, cantidadReservada: 0 });
      expect(await eventosVencidos(p)).toHaveLength(resultados[0] as number);
    },
  );

  it('un vencimiento que espera el bloqueo vuelve a leer un pago ya aprobado', async () => {
    const p = await crear();
    await vencer(p, 'SOLO_ALERTAR');
    let listo!: () => void, continuar!: () => void, entrada!: () => void;
    const bloqueado = new Promise<void>((r) => {
        listo = r;
      }),
      permiso = new Promise<void>((r) => {
        continuar = r;
      }),
      entrando = new Promise<void>((r) => {
        entrada = r;
      });
    const retencion = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM pedidos WHERE codigo = ${p.codigo} FOR UPDATE`;
        listo();
        await permiso;
        await tx.pagoPedido.updateMany({
          where: { pedido: { codigo: p.codigo } },
          data: { estado: 'APROBADO' },
        });
        await tx.pedido.update({
          where: { codigo: p.codigo },
          data: { estadoEntrega: 'CONFIRMADO', version: { increment: 1 } },
        });
      },
      { timeout: 10000 },
    );
    await bloqueado;
    const escritura = app.get(EscrituraPedidoService),
      original = escritura.bloquear.bind(escritura);
    vi.spyOn(escritura, 'bloquear').mockImplementationOnce(async (...args) => {
      entrada();
      return original(...args);
    });
    const trabajador = servicio().procesarPedido(p.codigo);
    try {
      await entrando;
    } finally {
      continuar();
    }
    await retencion;
    expect(await trabajador).toBe(0);
    expect((await reservas(p))[0].estado).toBe('ACTIVA');
  });

  it('mantiene el plazo histórico cuando el cliente corrige un comprobante observado', async () => {
    let p = await crear();
    p = (await revisar(p, 'OBSERVADO').expect(201)).body.pedido;
    await vencer(p, 'SOLO_ALERTAR');
    const [antes] = await reservas(p);
    await servicio().procesarPedido(p.codigo);
    p = await ver(p);
    const d = await nuevo();
    await propietario.cliente
      .post(`/api/pedidos/${p.codigo}/comprobantes`)
      .set('Origin', origen)
      .set('X-CSRF-Token', propietario.csrf)
      .send({
        versionPedido: p.version,
        versionPago: p.pago!.version,
        comprobanteId: p.pago!.comprobantes.at(-1)!.id,
        comprobante: d.comprobante,
      })
      .expect(201);
    expect((await reservas(p))[0].venceEn).toEqual(antes.venceEn);
    expect(await servicio().procesarPedido(p.codigo)).toBe(0);
    expect(await eventosVencidos(p)).toHaveLength(1);
  });

  it('atiende exactamente al llegar a la fecha límite, nunca un milisegundo antes', async () => {
    const p = await crear();
    await vencer(p, 'SOLO_ALERTAR', true);
    const [r] = await reservas(p);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(r.venceEn!.getTime() - 1));
      expect(await servicio().procesarPedido(p.codigo)).toBe(0);
      vi.setSystemTime(r.venceEn!);
      expect(await servicio().procesarPedido(p.codigo)).toBe(1);
      expect((await reservas(p))[0].vencimientoAtendidoEn).toEqual(r.venceEn);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un lote continúa con otro pedido si el primero tiene inventario inconsistente', async () => {
    const p = await crear(),
      segundo = await crear();
    // Dos variantes diferentes para aislar el contador inconsistente.
    await prisma.reservaInventario.deleteMany({
      where: { articulo: { pedido: { codigo: segundo.codigo } } },
    });
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { cantidadReservada: 2 },
    });
    const articulo = await prisma.pedidoArticulo.findFirstOrThrow({
      where: { pedido: { codigo: segundo.codigo } },
    });
    await prisma.pedidoArticulo.update({
      where: { id: articulo.id },
      data: { varianteId: idsVariantes[1], sku: skuOtro },
    });
    const original = (await reservas(p))[0];
    await prisma.reservaInventario.create({
      data: {
        pedidoArticuloId: articulo.id,
        cantidad: 2,
        configuracionId: original.configuracionId,
        configuracionVersion: original.configuracionVersion,
        modo: 'HASTA_DECISION',
        accionCancelacion: original.accionCancelacion,
      },
    });
    await prisma.variante.update({
      where: { id: idsVariantes[1] },
      data: { cantidadReservada: 2 },
    });
    await vencer(p);
    await vencer(segundo);
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { cantidadReservada: 1 },
    });
    const resultado = await servicio().procesarLote();
    expect(resultado).toEqual({ atendidas: 1, fallidas: 1 });
    expect((await reservas(p))[0].vencimientoAtendidoEn).toBeNull();
    expect((await reservas(segundo))[0].estado).toBe('LIBERADA');
  });

  it('aprobar y alertar simultáneamente con SOLO_ALERTAR conserva todas las unidades', async () => {
    const p = await crear();
    await vencer(p, 'SOLO_ALERTAR');
    const [atendidas, pago] = await Promise.all([
      servicio().procesarPedido(p.codigo),
      revisar(p),
    ]);
    if (pago.status === 409) await revisar(await ver(p)).expect(201);
    else expect(pago.status).toBe(201);
    expect((await ver(p)).pago!.estado).toBe('APROBADO');
    expect((await reservas(p))[0].estado).toBe('ACTIVA');
    expect(await eventosVencidos(p)).toHaveLength(atendidas);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(2);
  });

  it('liberar por plazo y aprobar simultáneamente nunca confirma una reserva vencida', async () => {
    const p = await crear();
    await vencer(p);
    const [atendidas, pago] = await Promise.all([
      servicio().procesarPedido(p.codigo),
      revisar(p),
    ]);
    expect(atendidas).toBe(1);
    expect(pago.status).toBe(409);
    expect((await ver(p)).pago!.estado).toBe('PENDIENTE');
    expect((await reservas(p))[0].estado).toBe('LIBERADA');
  });

  it('recupera vencimientos acumulados mediante lotes sin una sesión administrativa', async () => {
    const p = await crear(true);
    await vencer(p, 'SOLO_ALERTAR');
    await prisma.sesion.deleteMany({
      where: { usuarioId: { in: idsUsuarios } },
    });
    expect(await servicio().procesarLote()).toEqual({
      atendidas: 2,
      fallidas: 0,
    });
    expect(await servicio().procesarLote()).toEqual({
      atendidas: 0,
      fallidas: 0,
    });
    expect(await eventosVencidos(p)).toHaveLength(2);
  });
});
