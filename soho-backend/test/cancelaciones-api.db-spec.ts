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
import type { ContextoAuth } from '../src/autenticacion/sesiones/contexto-auth.js';
import type { RespuestaPedido } from '../src/pedidos/dto/respuesta-pedido.js';
import { datosPedido } from './pedidos-fixtures.js';
import { CancelacionesPedidosService } from '../src/pedidos/cancelaciones/cancelaciones-pedidos.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Pedidos requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url);
const prefijo = `capi-${randomBytes(5).toString('hex')}`,
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

describe.sequential('Cancelaciones reales con HTTP y MySQL aislado', () => {
  let app: INestApplication,
    privado: string,
    propietario: Navegador,
    otro: Navegador,
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
    [propietario, otro, admin] = navegadores;
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
  const contexto = async (): Promise<ContextoAuth> => {
    const s = await prisma.sesion.findFirstOrThrow({
      where: { usuarioId: idsUsuarios[2] },
    });
    return {
      sesionId: s.id,
      usuario: {
        id: idsUsuarios[2],
        nombres: 'Ana',
        apellidos: 'Prueba',
        correo: 'admin@cancelaciones.test',
        rol: 'ADMIN',
        correoVerificado: false,
      },
    };
  };
  const cuerpo = (p: Pedido) => ({
    versionPedido: p.version,
    versionPago: p.pago!.version,
    confirmado: true as const,
    motivo: 'Cancelación privada para prueba de persistencia.',
  });
  const retenido = async (dos = false): Promise<Pedido> => {
    const p = await crear(dos);
    await politicaPedido(p, 'PREGUNTAR');
    return (
      await cancelar(p, { decisionReservasConsultadas: 'CONSERVAR' }).expect(
        200,
      )
    ).body.pedido as Pedido;
  };
  const otroAdmin = () =>
    prisma.usuario.update({
      where: { id: idsUsuarios[1] },
      data: { rol: 'ADMIN' },
    });

  it('cancela un invitado, libera automáticamente y conserva su comprobante privado', async () => {
    const n = await invitado(),
      p = await crear(false, n),
      antes = await prisma.comprobantePago.findMany();
    const r = await cancelar(p).expect(200),
      c = r.body.pedido;
    expect(r.headers['cache-control']).toBe('no-store');
    expect(c).toMatchObject({
      estadoEntrega: 'CANCELADO',
      version: p.version + 1,
      pago: { estado: 'ANULADO', version: p.pago!.version + 1 },
      cancelacion: {
        motivo: 'Solicitud privada del cliente de cancelar.',
        estadoEntregaAnterior: 'PENDIENTE',
        estadoPagoAnterior: 'PENDIENTE',
        versionPedido: p.version + 1,
        decisionReservasConsultadas: null,
        registradaPor: { id: idsUsuarios[2] },
      },
      reservasCancelacion: { unidadesRetenidas: 0 },
    });
    expect(await prisma.comprobantePago.findMany()).toEqual(antes);
    expect(
      (await stock()).every(
        (v) => v.existencias === 5 && v.cantidadReservada === 0,
      ),
    ).toBe(true);
    expect(await prisma.movimientoInventario.count()).toBe(0);
    const publico = (await get(n, `${ruta}/${p.codigo}`).expect(200)).body
      .pedido;
    expect(publico.cancelacion).toEqual({ fecha: c.cancelacion.fecha });
    expect(
      publico.eventos.every(
        (e: { tipo: string }) =>
          !['NOTA_INTERNA', 'RESERVA_LIBERADA'].includes(e.tipo),
      ),
    ).toBe(true);
    expect(JSON.stringify(publico)).not.toContain('Solicitud privada');
    expect(JSON.stringify(publico)).not.toContain(idsUsuarios[2]);
    await get(n, publico.pago.comprobantes[0].ruta).expect(200);
    await get(otro, `${ruta}/${p.codigo}`).expect(404);
    const eventos = await prisma.eventoPedido.findMany({
      where: { pedido: { codigo: p.codigo } },
      orderBy: { secuencia: 'asc' },
    });
    expect(new Set(eventos.map((e) => e.secuencia)).size).toBe(eventos.length);
    expect(
      eventos
        .filter((e) => e.versionPedido === c.version)
        .every(
          (e) => e.responsableId === idsUsuarios[2] && e.actor === 'ADMIN',
        ),
    ).toBe(true);
  });
  it.each(['OBSERVADO', 'RECHAZADO', 'APROBADO', 'ANULADO'] as const)(
    'conserva la revisión histórica de un pago %s',
    async (estado) => {
      let p = await crear();
      if (estado === 'ANULADO') {
        await prisma.pagoPedido.updateMany({
          where: { pedido: { codigo: p.codigo } },
          data: { estado: 'ANULADO', version: { increment: 1 } },
        });
        await prisma.pedido.update({
          where: { codigo: p.codigo },
          data: { version: { increment: 1 } },
        });
        p = await ver(p);
      } else p = (await revisar(p, estado).expect(201)).body.pedido as Pedido;
      const comprobantes = await prisma.comprobantePago.findMany(),
        previas = await stock();
      const r = (await cancelar(p).expect(200)).body.pedido;
      expect(r.pago.estado).toBe(
        estado === 'APROBADO' ? 'APROBADO' : 'ANULADO',
      );
      expect(r.pago.version).toBe(
        p.pago!.version + (['APROBADO', 'ANULADO'].includes(estado) ? 0 : 1),
      );
      expect(r.cancelacion.estadoPagoAnterior).toBe(estado);
      expect(await prisma.comprobantePago.findMany()).toEqual(comprobantes);
      expect((await stock()).every((v) => v.cantidadReservada === 0)).toBe(
        true,
      );
      expect((await stock()).map((v) => v.existencias)).toEqual(
        previas.map((v) => v.existencias),
      );
      if (estado === 'APROBADO') {
        const resumen = await get(
          admin,
          '/api/admin/resumen-pedidos?desde=2026-01-01&hasta=2026-12-31',
        ).expect(200);
        expect(resumen.body.porPrepararTotal).toBe(0);
        expect(
          resumen.body.ventas.reduce(
            (n: number, d: { importe: number }) => n + d.importe,
            0,
          ),
        ).toBe(199.98);
      }
    },
  );
  it('conserva la preparación, sus fechas y responsable al cancelar', async () => {
    let p = await crear();
    p = (await revisar(p).expect(201)).body.pedido as Pedido;
    p = await preparar(p);
    const envio = await prisma.envioPedido.findFirstOrThrow();
    await cancelar(p).expect(200);
    expect(await prisma.envioPedido.findFirstOrThrow()).toEqual(envio);
    expect(
      (await stock()).every(
        (v) => v.existencias === 5 && v.cantidadReservada === 0,
      ),
    ).toBe(true);
  });
  it('cancela una incidencia aunque las existencias físicas sean menores que las reservas', async () => {
    const p = await crear();
    await prisma.pedido.update({
      where: { codigo: p.codigo },
      data: { estadoEntrega: 'INCIDENCIA' },
    });
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { existencias: 0 },
    });
    const r = (await cancelar(p).expect(200)).body.pedido;
    expect(r.cancelacion.estadoEntregaAnterior).toBe('INCIDENCIA');
    expect(
      await prisma.variante.findUnique({ where: { id: idsVariantes[0] } }),
    ).toMatchObject({ existencias: 0, cantidadReservada: 0 });
  });
  it('exige decidir únicamente cuando las reservas históricas requieren preguntar', async () => {
    const p = await crear();
    await politicaPedido(p, 'PREGUNTAR');
    await cancelar(p).expect(400);
    expect(await prisma.cancelacionPedido.count()).toBe(0);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(2);
    const r = (
      await cancelar(p, { decisionReservasConsultadas: 'LIBERAR' }).expect(200)
    ).body.pedido;
    expect(r.cancelacion.decisionReservasConsultadas).toBe('LIBERAR');
    expect(r.reservasCancelacion.unidadesRetenidas).toBe(0);
  });
  it('rechaza una decisión inventada cuando corresponde liberación automática', async () => {
    const p = await crear();
    await cancelar(p, { decisionReservasConsultadas: 'CONSERVAR' }).expect(400);
    expect(await prisma.cancelacionPedido.count()).toBe(0);
  });
  it('conserva reservas consultadas y permite liberarlas después con otro administrador', async () => {
    const p = await retenido(),
      registro = await prisma.cancelacionPedido.findFirstOrThrow(),
      comprobantes = await prisma.comprobantePago.findMany();
    expect((await ver(p)).reservasCancelacion).toMatchObject({
      unidadesRetenidas: 2,
      puedeLiberarRetenidas: true,
    });
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(2);
    await otroAdmin();
    const r = (await liberar(p, {}, otro).expect(200)).body.pedido;
    expect(r).toMatchObject({
      estadoEntrega: 'CANCELADO',
      version: p.version + 1,
      pago: { version: p.pago!.version },
      reservasCancelacion: {
        unidadesRetenidas: 0,
        puedeLiberarRetenidas: false,
      },
    });
    expect(r.eventosInternos.at(-1)).toMatchObject({
      actor: 'ADMIN',
      responsable: { id: idsUsuarios[1] },
      titulo: 'Reservas retenidas liberadas',
    });
    expect(await prisma.cancelacionPedido.findFirstOrThrow()).toEqual(registro);
    expect(await prisma.comprobantePago.findMany()).toEqual(comprobantes);
    expect(
      (await stock()).every(
        (v) => v.existencias === 5 && v.cantidadReservada === 0,
      ),
    ).toBe(true);
    expect(await prisma.movimientoInventario.count()).toBe(0);
    expect(
      await prisma.eventoPedido.findFirst({
        where: {
          pedido: { codigo: p.codigo },
          titulo: 'Reservas retenidas liberadas',
        },
      }),
    ).toMatchObject({
      responsableId: idsUsuarios[1],
      versionPedido: r.version,
      visibilidad: 'INTERNA',
    });
    await liberar(p).expect(409);
    await liberar(r).expect(409);
  });
  it('una decisión de conservar no evita liberar otras reservas automáticas del pedido', async () => {
    const p = await crear(true);
    await prisma.reservaInventario.updateMany({
      where: {
        articulo: { pedido: { codigo: p.codigo }, varianteId: idsVariantes[1] },
      },
      data: { accionCancelacion: 'PREGUNTAR' },
    });
    const c = (
      await cancelar(p, { decisionReservasConsultadas: 'CONSERVAR' }).expect(
        200,
      )
    ).body.pedido;
    expect(c.reservasCancelacion.unidadesRetenidas).toBe(2);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(0);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[1])!.cantidadReservada,
    ).toBe(2);
    await liberar(c).expect(200);
    expect((await stock()).every((v) => v.cantidadReservada === 0)).toBe(true);
  });
  it('usa la política histórica aunque cambien la configuración, el catálogo y la cobertura', async () => {
    const p = await crear();
    await politicaPedido(p, 'PREGUNTAR');
    const pasada = new Date(Date.now() - 7200000);
    await prisma.reservaInventario.updateMany({
      where: { articulo: { pedido: { codigo: p.codigo } } },
      data: {
        modo: 'TIEMPO',
        horas: 1,
        accionVencimiento: 'LIBERAR_Y_ALERTAR',
        creadoEn: pasada,
        venceEn: new Date(pasada.getTime() + 3600000),
      },
    });
    await prisma.configuracionReserva.update({
      where: { id: 1 },
      data: { accionCancelacion: 'LIBERAR', version: { increment: 1 } },
    });
    await prisma.producto.update({
      where: { id: productoId },
      data: { estado: 'ARCHIVADO', precio: '199.99' },
    });
    await prisma.zonaEntrega.update({
      where: { codigo: 'la-esperanza' },
      data: { habilitada: false, plazo: 'Plazo posterior' },
    });
    await cancelar(p).expect(400);
    const c = (
      await cancelar(p, { decisionReservasConsultadas: 'CONSERVAR' }).expect(
        200,
      )
    ).body.pedido;
    expect(c).toMatchObject({ total: p.total, entrega: p.entrega });
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!.cantidadReservada,
    ).toBe(2);
    await liberar(c).expect(200);
  });
  it('la cancelación no libera unidades de otro pedido con la misma variante', async () => {
    const a = await crear(),
      b = await crear();
    await cancelar(a).expect(200);
    expect(
      (await stock()).find((v) => v.id === idsVariantes[0])!,
    ).toMatchObject({ existencias: 5, cantidadReservada: 2 });
    expect(
      await prisma.reservaInventario.findFirst({
        where: { articulo: { pedido: { codigo: b.codigo } } },
      }),
    ).toMatchObject({ estado: 'ACTIVA', cantidad: 2 });
  });
  it('bloquea doble cancelación aunque se utilice la versión actualizada', async () => {
    const p = await crear(),
      c = (await cancelar(p).expect(200)).body.pedido;
    await cancelar(p).expect(409);
    await cancelar(c).expect(409);
    expect(await prisma.cancelacionPedido.count()).toBe(1);
    expect(
      await prisma.eventoPedido.count({
        where: { titulo: 'Pedido cancelado' },
      }),
    ).toBe(1);
  });
  it('dos administradores que cancelan a la vez producen una sola liberación', async () => {
    const p = await crear(true);
    await otroAdmin();
    const rs = await Promise.all([cancelar(p), cancelar(p, {}, otro)]);
    expect(rs.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(await prisma.cancelacionPedido.count()).toBe(1);
    expect(
      (await stock()).every(
        (v) => v.cantidadReservada === 0 && v.existencias === 5,
      ),
    ).toBe(true);
  });
  it('dos administradores que liberan a la vez no restan las reservas dos veces', async () => {
    const p = await retenido(true);
    await otroAdmin();
    const rs = await Promise.all([liberar(p), liberar(p, {}, otro)]);
    expect(rs.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      await prisma.eventoPedido.count({
        where: { titulo: 'Reservas retenidas liberadas' },
      }),
    ).toBe(1);
  });
  it('serializa cancelación y aprobación sin perder la decisión que ganó', async () => {
    const p = await crear();
    await otroAdmin();
    const [c, a] = await Promise.all([
      cancelar(p),
      revisar(p, 'APROBADO', otro),
    ]);
    expect([c.status, a.status]).toContain(409);
    const actual = await ver(p);
    if (c.status === 200) {
      expect(a.status).toBe(409);
      expect(actual.pago!.estado).toBe('ANULADO');
    } else {
      expect(a.status).toBe(201);
      expect(actual.pago!.estado).toBe('APROBADO');
      await cancelar(actual).expect(200);
    }
    expect(
      (await stock()).every(
        (v) => v.cantidadReservada === 0 && v.existencias === 5,
      ),
    ).toBe(true);
  });
  it('serializa cancelación y despacho; solo el despacho ganador descuenta existencias', async () => {
    let p = await crear();
    p = (await revisar(p).expect(201)).body.pedido as Pedido;
    p = await preparar(p);
    await otroAdmin();
    const rs = await Promise.all([cancelar(p), despachar(p, otro)]);
    expect(rs.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const actual = await ver(p),
      s = (await stock()).find((v) => v.id === idsVariantes[0])!;
    expect(s).toMatchObject({
      existencias: actual.estadoEntrega === 'ENVIADO' ? 3 : 5,
      cantidadReservada: 0,
    });
    expect(await prisma.movimientoInventario.count()).toBe(
      actual.estadoEntrega === 'ENVIADO' ? 1 : 0,
    );
    expect(await prisma.cancelacionPedido.count()).toBe(
      actual.estadoEntrega === 'CANCELADO' ? 1 : 0,
    );
  });
  it('serializa la corrección del cliente y la cancelación conservando los comprobantes confirmados', async () => {
    let p = await crear();
    p = (await revisar(p, 'OBSERVADO').expect(201)).body.pedido as Pedido;
    const d = await nuevo();
    const [c, corregido] = await Promise.all([
      cancelar(p),
      propietario.cliente
        .post(`${ruta}/${p.codigo}/comprobantes`)
        .set('Origin', origen)
        .set('X-CSRF-Token', propietario.csrf)
        .send({
          versionPedido: p.version,
          versionPago: p.pago!.version,
          comprobanteId: p.pago!.comprobantes.at(-1)!.id,
          comprobante: { ...d.comprobante, numeroOperacion: '009999' },
        }),
    ]);
    expect([c.status, corregido.status]).toContain(409);
    expect(await prisma.comprobantePago.count()).toBe(
      corregido.status === 201 ? 2 : 1,
    );
    if (corregido.status === 201) await cancelar(await ver(p)).expect(200);
    else expect(c.status).toBe(200);
    expect((await ver(p)).estadoEntrega).toBe('CANCELADO');
  });
  it('protege ambas rutas con ADMIN, origen y CSRF', async () => {
    const p = await crear();
    for (const sufijo of ['cancelacion', 'cancelacion/liberar-reservas']) {
      const destino = `/api/admin/pedidos/${p.codigo}/${sufijo}`;
      await request(app.getHttpServer())
        .post(destino)
        .send(cuerpo(p))
        .expect(401);
      await propietario.cliente
        .post(destino)
        .set('Origin', origen)
        .set('X-CSRF-Token', propietario.csrf)
        .send(cuerpo(p))
        .expect(403);
      await admin.cliente
        .post(destino)
        .set('Origin', origen)
        .send(cuerpo(p))
        .expect(403);
      await admin.cliente
        .post(destino)
        .set('Origin', 'https://ajeno.test')
        .set('X-CSRF-Token', admin.csrf)
        .send(cuerpo(p))
        .expect(403);
    }
    expect(await prisma.cancelacionPedido.count()).toBe(0);
  });
  it('rechaza versiones viejas, confirmación falsa, campos no permitidos y códigos inválidos', async () => {
    const p = await crear();
    await cancelar(p, { versionPedido: p.version + 1 }).expect(409);
    await cancelar(p, { versionPago: p.pago!.version + 1 }).expect(409);
    await cancelar(p, { confirmado: false }).expect(400);
    await cancelar(p, { registradaPorId: idsUsuarios[0] }).expect(400);
    await cancelar({ ...p, codigo: 'invalido' }).expect(404);
    await cancelar({ ...p, codigo: 'SOHO-NOEXISTENTE' }).expect(404);
  });
  it.each(['ENVIADO', 'ENTREGADO', 'CANCELADO'] as const)(
    'no permite cancelar un pedido %s',
    async (estadoEntrega) => {
      const p = await crear();
      await prisma.pedido.update({
        where: { codigo: p.codigo },
        data: { estadoEntrega },
      });
      await cancelar(p).expect(409);
      expect(await prisma.cancelacionPedido.count()).toBe(0);
    },
  );
  it('comprueba el despacho registrado aunque se altere el estado del pedido', async () => {
    let p = await crear();
    p = (await revisar(p).expect(201)).body.pedido as Pedido;
    p = await preparar(p);
    p = (await despachar(p).expect(200)).body.pedido as Pedido;
    await prisma.pedido.update({
      where: { codigo: p.codigo },
      data: { estadoEntrega: 'INCIDENCIA' },
    });
    await cancelar(p).expect(409);
    expect(await prisma.movimientoInventario.count()).toBe(1);
    expect(await prisma.cancelacionPedido.count()).toBe(0);
  });
  it('no permite cancelar reservas consumidas aunque no exista el registro de despacho', async () => {
    const p = await crear();
    await prisma.reservaInventario.updateMany({
      where: { articulo: { pedido: { codigo: p.codigo } } },
      data: {
        estado: 'CONSUMIDA',
        cerradaEn: new Date(),
        motivoCierre: 'Consumo histórico de prueba',
      },
    });
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { cantidadReservada: 0 },
    });
    await cancelar(p).expect(409);
  });
  it.each([1, 3])(
    'rechaza el contador incoherente %s sin registrar una cancelación parcial',
    async (cantidadReservada) => {
      const p = await crear(true);
      await prisma.variante.update({
        where: { id: idsVariantes[1] },
        data: { cantidadReservada },
      });
      const antes = await stock(),
        r = await cancelar(p).expect(409);
      expect(r.body.codigo).toBe('INVENTARIO_INCONSISTENTE');
      expect(await stock()).toEqual(antes);
      expect(await prisma.cancelacionPedido.count()).toBe(0);
    },
  );
  it('no libera una retención con contador incoherente ni cambia el registro original', async () => {
    const p = await retenido(),
      registro = await prisma.cancelacionPedido.findFirstOrThrow();
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { cantidadReservada: 1 },
    });
    await liberar(p).expect(409);
    expect(await prisma.cancelacionPedido.findFirstOrThrow()).toEqual(registro);
    expect(await prisma.reservaInventario.findFirst()).toMatchObject({
      estado: 'ACTIVA',
    });
  });
  it('una reserva con cantidad distinta a la línea exige conciliación antes de cancelar', async () => {
    const p = await crear();
    await prisma.reservaInventario.updateMany({
      where: { articulo: { pedido: { codigo: p.codigo } } },
      data: { cantidad: 1 },
    });
    await prisma.variante.update({
      where: { id: idsVariantes[0] },
      data: { cantidadReservada: 1 },
    });
    await cancelar(p).expect(409);
    expect(await prisma.cancelacionPedido.count()).toBe(0);
  });
  it('no permite liberar un pedido sin cancelación ni reservas conservadas', async () => {
    const p = await crear();
    await liberar(p).expect(409);
    const c = (await cancelar(p).expect(200)).body.pedido;
    await liberar(c).expect(409);
  });
  it.each(['cancelar', 'liberar'] as const)(
    'revierte toda la operación %s si falla la segunda variante',
    async (accion) => {
      const p =
          accion === 'cancelar' ? await crear(true) : await retenido(true),
        antes = await stock(),
        registro = await prisma.cancelacionPedido.findMany();
      const escritura = app.get(EscrituraPedidoService),
        original = escritura.transaccion.bind(escritura);
      vi.spyOn(escritura, 'transaccion').mockImplementationOnce((operacion) =>
        original(async (tx) => {
          const actualizar = tx.variante.updateMany.bind(tx.variante);
          let n = 0;
          vi.spyOn(tx.variante, 'updateMany').mockImplementation((...args) => {
            if (++n === 2) throw Error('Fallo sintético en segunda variante');
            return Reflect.apply(actualizar, tx.variante, args);
          });
          return operacion(tx);
        }),
      );
      const service = app.get(CancelacionesPedidosService),
        ctx = await contexto();
      await expect(
        accion === 'cancelar'
          ? service.cancelar(p.codigo, cuerpo(p), ctx)
          : service.liberar(p.codigo, cuerpo(p), ctx),
      ).rejects.toThrow('segunda variante');
      expect(await stock()).toEqual(antes);
      expect(await prisma.cancelacionPedido.findMany()).toEqual(registro);
      expect((await ver(p)).version).toBe(p.version);
      expect(
        await prisma.reservaInventario.count({ where: { estado: 'ACTIVA' } }),
      ).toBe(2);
    },
  );
  it.each([
    'revocada',
    'degradada',
    'inactiva',
    'vencida',
    'inactividad',
  ] as const)(
    'revalida dentro de la transacción la sesión %s',
    async (caso) => {
      const p = await crear(),
        ctx = await contexto();
      if (caso === 'degradada' || caso === 'inactiva')
        await prisma.usuario.update({
          where: { id: idsUsuarios[2] },
          data: caso === 'degradada' ? { rol: 'CLIENTE' } : { activo: false },
        });
      else
        await prisma.sesion.update({
          where: { id: ctx.sesionId },
          data:
            caso === 'revocada'
              ? { revocadaEn: new Date() }
              : caso === 'vencida'
                ? {
                    creadaEn: new Date(Date.now() - 7200000),
                    ultimaActividadEn: new Date(Date.now() - 3600000),
                    expiraEn: new Date(Date.now() - 1000),
                  }
                : {
                    creadaEn: new Date(Date.now() - 7200000),
                    ultimaActividadEn: new Date(Date.now() - 3600000),
                  },
        });
      await expect(
        app.get(CancelacionesPedidosService).cancelar(p.codigo, cuerpo(p), ctx),
      ).rejects.toMatchObject({ status: 401 });
      expect(await prisma.cancelacionPedido.count()).toBe(0);
    },
  );
  it('revalida una sesión revocada mientras esperaba su bloqueo en MySQL', async () => {
    const p = await crear(),
      ctx = await contexto();
    let listo!: () => void, continuar!: () => void, iniciado!: () => void;
    const bloqueado = new Promise<void>((r) => {
        listo = r;
      }),
      permiso = new Promise<void>((r) => {
        continuar = r;
      }),
      entrada = new Promise<void>((r) => {
        iniciado = r;
      });
    const retencion = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM sesiones WHERE id = ${ctx.sesionId} FOR UPDATE`;
        listo();
        await permiso;
        await tx.sesion.update({
          where: { id: ctx.sesionId },
          data: { revocadaEn: new Date() },
        });
      },
      { timeout: 10000 },
    );
    await bloqueado;
    const escritura = app.get(EscrituraPedidoService),
      real = escritura.sesion.bind(escritura);
    vi.spyOn(escritura, 'sesion').mockImplementationOnce(async (...args) => {
      iniciado();
      return real(...args);
    });
    const resultado = expect(
      app.get(CancelacionesPedidosService).cancelar(p.codigo, cuerpo(p), ctx),
    ).rejects.toMatchObject({ status: 401 });
    try {
      await entrada;
    } finally {
      continuar();
    }
    await retencion;
    await resultado;
    expect(await prisma.cancelacionPedido.count()).toBe(0);
  });
  it.each(['cancelar', 'liberar'] as const)(
    'recupera por GET un COMMIT de %s cuya respuesta se perdió sin volver a liberar',
    async (accion) => {
      const p = accion === 'cancelar' ? await crear() : await retenido(),
        ctx = await contexto(),
        original = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementationOnce(
        async (...args) => {
          await Reflect.apply(original, prisma, args);
          throw Error('Respuesta perdida después de COMMIT');
        },
      );
      const service = app.get(CancelacionesPedidosService);
      await expect(
        accion === 'cancelar'
          ? service.cancelar(p.codigo, cuerpo(p), ctx)
          : service.liberar(p.codigo, cuerpo(p), ctx),
      ).rejects.toThrow('después de COMMIT');
      const actual = await ver(p);
      expect(actual.estadoEntrega).toBe('CANCELADO');
      expect(actual.version).toBe(p.version + 1);
      expect(
        (await stock()).every(
          (v) => v.existencias === 5 && v.cantidadReservada === 0,
        ),
      ).toBe(true);
      if (accion === 'cancelar') await cancelar(p).expect(409);
      else await liberar(p).expect(409);
      expect(await prisma.cancelacionPedido.count()).toBe(1);
    },
  );
  it('rechaza fechas futuras en el pedido y la cancelación antes de cerrar reservas', async () => {
    const p = await crear(),
      futura = new Date(Date.now() + 3600000);
    await prisma.pedido.update({
      where: { codigo: p.codigo },
      data: { creadoEn: futura },
    });
    await cancelar(p).expect(409);
    await prisma.pedido.update({
      where: { codigo: p.codigo },
      data: { creadoEn: new Date() },
    });
    await politicaPedido(p, 'PREGUNTAR');
    const c = (
      await cancelar(p, { decisionReservasConsultadas: 'CONSERVAR' }).expect(
        200,
      )
    ).body.pedido;
    await prisma.cancelacionPedido.updateMany({
      where: { pedido: { codigo: p.codigo } },
      data: { canceladaEn: futura },
    });
    await liberar(c).expect(409);
    expect(await prisma.reservaInventario.findFirst()).toMatchObject({
      estado: 'ACTIVA',
    });
  });
});
