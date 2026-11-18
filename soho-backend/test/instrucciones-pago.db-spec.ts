import { Test } from '@nestjs/testing';
import { HttpException, type INestApplication } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';
import { EscrituraAutorizadaService } from '../src/autenticacion/seguridad/escritura-autorizada.service.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { ConfiguracionCheckoutPagos } from '../src/pedidos/preparacion/configuracion-checkout-pagos.js';
import { PreparacionPedidoService } from '../src/pedidos/preparacion/preparacion-pedido.service.js';
import type { PreparacionPedido } from '../src/pedidos/preparacion/preparacion-pedido.interface.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import {
  ConfiguracionCloudinary,
  HTTP_CLOUDINARY,
} from '../src/productos/fotografias/configuracion-cloudinary.js';
import { InstruccionesPagoService } from '../src/pagos/instrucciones-pago.service.js';
import { RespuestaInstruccionPago } from '../src/pagos/dto/respuesta-instruccion-pago.js';
import { datosPedido } from './pedidos-fixtures.js';

const valor = process.env.TEST_INSTRUCCIONES_DATABASE_URL;
if (!valor)
  throw Error(
    'Instrucciones requiere TEST_INSTRUCCIONES_DATABASE_URL exclusiva.',
  );
const destino = new URL(obtenerUrlBaseDatos(valor));
if (
  !['localhost', '127.0.0.1'].includes(destino.hostname) ||
  !destino.pathname.endsWith('_test')
)
  throw Error('Instrucciones solo usa MySQL local con sufijo _test.');
const prisma = crearClientePrisma(valor),
  auth = crearConfiguracionAuth({}),
  limites = { comprobar: vi.fn() };
const externo = vi
  .fn<typeof fetch>()
  .mockRejectedValue(Error('No se permiten servicios externos reales.'));
const base = '/api/pagos/instrucciones',
  metodos = '/api/configuracion/pagos',
  origen = 'http://localhost:4200',
  clave = 'Clave sintética instrucciones 2026';
const sku = 'INST-TEST-BL-40P5',
  skuOtro = 'INST-TEST-BL-41';
type Cuenta = {
  agente: ReturnType<typeof request.agent>;
  csrf: string;
  id?: string;
  secreto?: string;
};
type Emision = {
  claveSolicitud: string;
  claveCreacionPedido: string;
  metodo: string;
  versionConfiguracionEsperada: number;
  preparacion: PreparacionPedido;
};
let app: INestApplication,
  privado: string,
  admin: Cuenta,
  cliente: Cuenta,
  otro: Cuenta,
  activa = false;
let productoId: string,
  varianteId: string,
  marcaId: string,
  categoriaId: string;
let zonas: Awaited<ReturnType<typeof prisma.zonaEntrega.findMany>>;
const puerta = () => {
  let abrir!: () => void;
  const promesa = new Promise<void>((resolve) => {
    abrir = resolve;
  });
  return { abrir, promesa };
};
async function cuenta(rol?: 'ADMIN' | 'CLIENTE'): Promise<Cuenta> {
  const agente = request.agent(app.getHttpServer()),
    csrf = (await agente.get('/api/auth/csrf').expect(200)).body
      .csrfToken as string;
  if (!rol) return { agente, csrf, secreto: randomBytes(32).toString('hex') };
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Instrucciones',
      correo: randomUUID() + '@instrucciones.test',
      rol,
      claveHash: await new ClavesService().crear(clave),
    },
  });
  const r = await agente
    .post('/api/auth/login')
    .set('Origin', origen)
    .set('X-CSRF-Token', csrf)
    .send({ correo: u.correo, clave })
    .expect(200);
  return { agente, csrf: r.body.csrfToken as string, id: u.id };
}
function post(d: unknown, c = cliente) {
  const q = c.agente
    .post(base)
    .set('Origin', origen)
    .set('X-CSRF-Token', c.csrf);
  if (c.secreto) q.set('X-Pedido-Acceso', c.secreto);
  return q.send(d as object);
}
function get(ruta: string, c = cliente) {
  const q = c.agente.get(ruta);
  return c.secreto ? q.set('X-Pedido-Acceso', c.secreto) : q;
}
async function datos(): Promise<Emision> {
  const d = await datosPedido(sku),
    v = await prisma.configuracionPagos.findUniqueOrThrow({
      where: { id: 1 },
      include: { versionActual: true },
    });
  return {
    claveSolicitud: randomUUID(),
    claveCreacionPedido: randomUUID(),
    metodo: 'YAPE',
    versionConfiguracionEsperada: v.versionActual?.numero ?? 1,
    preparacion: {
      contacto: d.contacto,
      entrega: d.entrega,
      facturacion: d.facturacion,
      articulos: d.articulos,
      cotizacion: d.cotizacion,
    },
  };
}
async function publicar(
  op: {
    yape?: boolean;
    plin?: boolean;
    celular?: string;
    qrId?: string | null;
  } = {},
) {
  const actual = await admin.agente
    .get('/api/admin/configuracion/pagos')
    .expect(200);
  return admin.agente
    .patch('/api/admin/configuracion/pagos')
    .set('Origin', origen)
    .set('X-CSRF-Token', admin.csrf)
    .send({
      claveSolicitud: randomUUID(),
      versionEsperada: actual.body.configuracion.version,
      confirmado: true,
      metodos: [
        {
          metodo: 'YAPE',
          activo: op.yape ?? true,
          celular: op.celular ?? '987654321',
          titular: 'SOHO Inicial',
          qrId: op.qrId ?? null,
        },
        {
          metodo: 'PLIN',
          activo: op.plin ?? true,
          celular: '912345678',
          titular: 'SOHO Plin',
          qrId: null,
        },
      ],
    })
    .expect(200);
}
async function contexto(c = cliente) {
  const s = await prisma.sesion.findFirstOrThrow({
    where: { usuarioId: c.id, revocadaEn: null },
  });
  return {
    sesion: {
      sesionId: s.id,
      usuario: {
        id: c.id!,
        nombres: 'Ana',
        apellidos: 'Instrucciones',
        correo: 'sintetica@instrucciones.test',
        rol: 'CLIENTE' as const,
        correoVerificado: false,
      },
    },
  };
}
async function negocio() {
  const tablas = await prisma.$queryRaw<
    Array<{ nombre: string }>
  >`SELECT TABLE_NAME nombre FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME NOT IN ('_prisma_migrations','instrucciones_pago','sesiones') ORDER BY TABLE_NAME`;
  const r: Record<string, string[]> = {};
  for (const { nombre } of tablas) {
    expect(nombre).toMatch(/^[a-z_]+$/);
    const filas = await prisma.$queryRawUnsafe<unknown[]>(
      'SELECT * FROM `' + nombre + '`',
    );
    r[nombre] = filas
      .map((x) =>
        JSON.stringify(x, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
      )
      .sort();
  }
  return r;
}

describe.sequential('Métodos e instrucciones con HTTP/MySQL temporal', () => {
  beforeAll(async () => {
    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.instruccionPago.count()).toBe(0);
    privado = await mkdtemp(path.join(tmpdir(), 'soho-instrucciones-test-'));
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(auth)
      .overrideProvider(ConfiguracionCheckoutPagos)
      .useValue({
        get habilitada() {
          return activa;
        },
      })
      .overrideProvider(ConfiguracionPedidos)
      .useValue(
        new ConfiguracionPedidos({
          PEDIDOS_DIRECTORIO_PRIVADO: privado,
          NODE_ENV: 'test',
        }),
      )
      .overrideProvider(ConfiguracionCloudinary)
      .useValue(new ConfiguracionCloudinary({ NODE_ENV: 'test' }))
      .overrideProvider(HTTP_CLOUDINARY)
      .useValue(externo)
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .overrideProvider(LimitesAuthService)
      .useValue(limites)
      .compile();
    app = m.createNestApplication({ bodyParser: false });
    app.use(cuerpoJsonGeneral());
    app.use(
      (
        req: import('express').Request,
        res: import('express').Response,
        next: import('express').NextFunction,
      ) => {
        const json = res.json.bind(res);
        res.json = (body: unknown) => {
          if (
            req.path === base &&
            req.method === 'POST' &&
            req.body?.claveSolicitud === perder &&
            res.statusCode === 201
          ) {
            perder = undefined;
            res.destroy();
            return res;
          }
          return json(body);
        };
        next();
      },
    );
    await app.init();
    admin = await cuenta('ADMIN');
    cliente = await cuenta('CLIENTE');
    otro = await cuenta('CLIENTE');
    marcaId = (
      await prisma.marca.create({
        data: {
          codigo: 'INST',
          nombre: 'Marca instrucciones',
          slug: 'marca-instrucciones',
        },
      })
    ).id;
    categoriaId = (
      await prisma.categoria.create({
        data: {
          nombre: 'Categoría instrucciones',
          slug: 'categoria-instrucciones',
        },
      })
    ).id;
    const talla = await prisma.talla.create({ data: { valor: '40.5' } }),
      otra = await prisma.talla.create({ data: { valor: '41' } });
    const p = await prisma.producto.create({
      data: {
        codigoInterno: 'INST-001',
        slug: 'producto-instrucciones',
        nombre: 'Producto instrucciones',
        modelo: 'Modelo instrucciones',
        codigoModelo: 'MODELOINST',
        precio: '99.99',
        estado: 'PUBLICADO',
        marcaId,
        categoriaId,
        imagenes: {
          create: { ruta: '/imagenes/productos/prueba.png', orden: 0 },
        },
        colores: {
          create: {
            codigo: 'BL',
            nombre: 'Blanco',
            hexadecimal: '#FFFFFF',
            variantes: {
              create: [
                { sku, tallaId: talla.id, existencias: 10 },
                { sku: skuOtro, tallaId: otra.id, existencias: 10 },
              ],
            },
          },
        },
      },
      include: { colores: { include: { variantes: true } } },
    });
    productoId = p.id;
    varianteId = p.colores[0].variantes.find((v) => v.sku === sku)!.id;
    zonas = await prisma.zonaEntrega.findMany();
  });
  let perder: string | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    limites.comprobar.mockReset();
    activa = true;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    expect(externo).not.toHaveBeenCalled();
    await app?.close();
    await prisma.$disconnect();
    if (privado) {
      const real = await realpath(privado);
      expect(real.startsWith(await realpath(tmpdir()))).toBe(true);
      expect(path.basename(real)).toMatch(/^soho-instrucciones-test-/);
      await rm(real, { recursive: true, force: true });
    }
  });

  it('mantiene emisión apagada por defecto y no expone receptores en el catálogo público', async () => {
    const r = await request(app.getHttpServer()).get(metodos).expect(200);
    expect(r.body).toEqual({ version: 0, disponible: false, metodos: [] });
    expect(r.headers['cache-control']).toBe('no-store');
    const antes = await negocio();
    await post(await datos()).expect(503);
    expect(await negocio()).toEqual(antes);
    expect(await prisma.instruccionPago.count()).toBe(0);
  });
  it('sin publicación no emite aunque la capacidad esté activa', async () => {
    const r = await post(await datos()).expect(409);
    expect(r.body.codigo).toBe('CONFIGURACION_PAGOS_CAMBIADA');
  });
  it('publica solo código/nombre/version y permite ambos métodos desactivados', async () => {
    await publicar({ yape: false, plin: false });
    expect(
      (await request(app.getHttpServer()).get(metodos).expect(200)).body,
    ).toMatchObject({ disponible: false, metodos: [] });
    await publicar({ plin: false });
    const r = await request(app.getHttpServer()).get(metodos).expect(200);
    expect(r.body.metodos).toEqual([{ metodo: 'YAPE', nombre: 'Yape' }]);
    expect(JSON.stringify(r.body)).not.toContain('987654321');
    expect(r.body.configuracion).toBeUndefined();
    await publicar();
  });
  it('emite preparación verificada, Decimal e identidad de variantes sin cambiar otras tablas', async () => {
    const d = await datos(),
      antes = await negocio(),
      r = await post(d).expect(201);
    expect(r.body).toMatchObject({
      versionContrato: 1,
      metodo: 'YAPE',
      moneda: 'PEN',
      importeReferencia: '199.98',
      destino: { celular: '987654321', titular: 'SOHO Inicial', qr: null },
      accesoExpiraEn: null,
      verificacion: {
        subtotal: '199.98',
        costoEnvio: '0.00',
        total: '199.98',
        articulos: [{ varianteId, cantidad: 2, talla: '40.5' }],
      },
    });
    expect(await negocio()).toEqual(antes);
    const i = await prisma.instruccionPago.findUniqueOrThrow({
      where: { id: r.body.instruccionId as string },
    });
    expect(i.usuarioId).toBe(cliente.id);
    expect(i.pedidoId).toBeNull();
    expect(i.preparacionHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await get(base + '/' + i.id).expect(200)).body).toEqual(r.body);
    expect(
      (await get(base + '/operaciones/' + d.claveSolicitud).expect(200)).body,
    ).toEqual(r.body);
  });
  it('emite Plin sin facturación y recupera el mismo JSON después de persistir', async () => {
    const d = await datos();
    d.metodo = 'PLIN';
    delete d.preparacion.facturacion;
    const r = await post(d).expect(201);
    expect(r.body.metodo).toBe('PLIN');
    expect(r.body.preparacion).not.toHaveProperty('facturacion');
    expect(
      (await get(base + '/' + r.body.instruccionId).expect(200)).body,
    ).toEqual(r.body);
    expect((await post(d).expect(200)).body).toEqual(r.body);
  });
  it('verifica productos por modelo/color y talla decimal con una fotografía disponible', async () => {
    const ahora = new Date(),
      grupo = await prisma.grupoModelo.create({
        data: {
          marcaId,
          codigoModelo: 'INSTNUEVO',
          modelo: 'Modelo nuevo',
          slugCarpeta: 'inst-nuevo',
        },
      }),
      talla = await prisma.talla.findFirstOrThrow({ where: { valor: '40.5' } }),
      p = await prisma.producto.create({
        data: {
          codigoInterno: 'INST-002',
          slug: 'producto-nuevo-negro',
          nombre: 'Producto nuevo Negro',
          modelo: 'Modelo nuevo',
          codigoModelo: 'INSTNUEVO',
          marcaId,
          grupoModeloId: grupo.id,
          codigoColor: 'NG',
          colorNombre: 'Negro',
          colorHexadecimal: '#000000',
          categoriaId,
          precio: '99.99',
          estado: 'PUBLICADO',
          colores: {
            create: { codigo: 'NG', nombre: 'Negro', hexadecimal: '#000000' },
          },
        },
        include: { colores: true },
      }),
      variante = await prisma.variante.create({
        data: {
          productoId: p.id,
          productoColorId: p.colores[0].id,
          tallaId: talla.id,
          sku: 'INST-INSTNUEVO-NG-40P5',
          existencias: 10,
        },
      }),
      foto = await prisma.archivoImagen.create({
        data: {
          productoOrigenId: p.id,
          proveedor: 'LEGADO',
          estado: 'DISPONIBLE',
          claveCarga: randomUUID(),
          solicitudHash: 'c'.repeat(64),
          urlEntrega: '/imagenes/productos/prueba.png',
          creadoEn: ahora,
          confirmadoEn: ahora,
        },
      });
    await prisma.imagenProducto.create({
      data: {
        productoId: p.id,
        archivoId: foto.id,
        ruta: foto.urlEntrega!,
        orden: 0,
      },
    });
    const d = await datos();
    d.preparacion.articulos[0].sku = variante.sku;
    const antes = await negocio(),
      r = await post(d).expect(201);
    expect(r.body.verificacion.articulos[0]).toMatchObject({
      productoId: p.id,
      varianteId: variante.id,
      sku: variante.sku,
      nombreProducto: 'Producto nuevo Negro',
      color: 'Negro',
      talla: '40.5',
    });
    expect(await negocio()).toEqual(antes);
    await prisma.imagenProducto.deleteMany({ where: { productoId: p.id } });
    await post({
      ...d,
      claveSolicitud: randomUUID(),
      claveCreacionPedido: randomUUID(),
    }).expect(422);
    expect(
      (await get(base + '/' + r.body.instruccionId).expect(200)).body,
    ).toEqual(r.body);
  });
  it('un error antes del COMMIT revierte la instrucción sin tocar inventario ni pedidos', async () => {
    const d = await datos(),
      n = await prisma.instruccionPago.count(),
      antes = await negocio();
    vi.spyOn(RespuestaInstruccionPago, 'leer').mockImplementationOnce(() => {
      throw new Error('Fallo sintético antes del COMMIT');
    });
    await expect(
      app.get(InstruccionesPagoService).emitir(d, await contexto()),
    ).rejects.toThrow('Fallo sintético');
    expect(await prisma.instruccionPago.count()).toBe(n);
    expect(await negocio()).toEqual(antes);
    await post(d).expect(201);
  });
  it('recupera el COMMIT confirmado aunque falle el retorno de la transacción', async () => {
    const d = await datos(),
      n = await prisma.instruccionPago.count(),
      escritura = app.get(EscrituraAutorizadaService),
      original = escritura.transaccion.bind(escritura);
    vi.spyOn(escritura, 'transaccion').mockImplementationOnce(
      async (operacion) => {
        await original(operacion);
        throw new Error('Retorno perdido después del COMMIT');
      },
    );
    const r = await app
      .get(InstruccionesPagoService)
      .emitir(d, await contexto());
    expect(r.reutilizada).toBe(true);
    expect(await prisma.instruccionPago.count()).toBe(n + 1);
    expect((await post(d).expect(200)).body).toEqual(r.respuesta);
  });
  it('invitado recibe expiración del servidor y nadie obtiene su instrucción sin la credencial', async () => {
    const c = await cuenta(),
      d = await datos(),
      r = await post(d, c).expect(201),
      id = r.body.instruccionId as string;
    expect(
      Date.parse(r.body.accesoExpiraEn) - Date.parse(r.body.emitidaEn),
    ).toBe(30 * 86400000);
    expect((await get(base + '/' + id, c).expect(200)).body).toEqual(r.body);
    await request(app.getHttpServer())
      .get(base + '/' + id)
      .expect(401);
    await get(base + '/' + id, await cuenta()).expect(404);
    await get(base + '/' + id, admin).expect(404);
    const i = await prisma.instruccionPago.findUniqueOrThrow({ where: { id } });
    expect(i.accesoInvitadoHash).toBe(
      createHash('sha256').update(c.secreto!).digest('hex'),
    );
    expect(JSON.stringify(r.body)).not.toContain(i.accesoInvitadoHash!);
  });
  it('sesión prevalece sobre el encabezado de invitado y no atribuye compras por correo', async () => {
    const d = await datos(),
      r = await cliente.agente
        .post(base)
        .set('Origin', origen)
        .set('X-CSRF-Token', cliente.csrf)
        .set('X-Pedido-Acceso', 'a'.repeat(64))
        .send(d)
        .expect(201);
    const i = await prisma.instruccionPago.findUniqueOrThrow({
      where: { id: r.body.instruccionId as string },
    });
    expect(i.usuarioId).toBe(cliente.id);
    expect(i.accesoInvitadoHash).toBeNull();
    await get(base + '/' + i.id, otro).expect(404);
  });
  it('cookie inválida no convierte la operación en invitada', async () => {
    const c = await cuenta(),
      d = await datos();
    await c.agente
      .post(base)
      .set('Origin', origen)
      .set('X-CSRF-Token', c.csrf)
      .set('Cookie', auth.cookieSesion + '=invalida')
      .set('X-Pedido-Acceso', c.secreto!)
      .send(d)
      .expect(401);
  });
  it('exige credencial privada, origen y CSRF, con cabeceras también en errores', async () => {
    const d = await datos();
    await request(app.getHttpServer())
      .get(base + '/' + randomUUID())
      .expect(401);
    const r = await cliente.agente.post(base).send(d).expect(403);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    await cliente.agente
      .post(base)
      .set('Origin', 'https://ajeno.test')
      .set('X-CSRF-Token', cliente.csrf)
      .send(d)
      .expect(403);
  });
  it.each([
    'extra',
    'version-texto',
    'version-cero',
    'metodo',
    'usuario',
    'preparacion-extra',
    'precio-formato',
    'cantidad',
    'sku-duplicado',
    'facturacion',
  ])('rechaza contrato %s sin crear instrucción', async (caso) => {
    const d = await datos(),
      n = await prisma.instruccionPago.count(),
      q = d as unknown as Record<string, unknown>;
    if (caso === 'extra') q.importeReferencia = '1.00';
    if (caso === 'version-texto') q.versionConfiguracionEsperada = '1';
    if (caso === 'version-cero') d.versionConfiguracionEsperada = 0;
    if (caso === 'metodo') d.metodo = 'TARJETA';
    if (caso === 'usuario') q.usuarioId = otro.id;
    if (caso === 'preparacion-extra')
      (d.preparacion as unknown as Record<string, unknown>).propietario =
        'ajeno';
    if (caso === 'precio-formato')
      d.preparacion.articulos[0].precioUnitarioEsperado = '99.9';
    if (caso === 'cantidad') d.preparacion.articulos[0].cantidad = 0;
    if (caso === 'sku-duplicado')
      d.preparacion.articulos.push({
        ...d.preparacion.articulos[0],
        sku: sku.toLowerCase(),
      });
    if (caso === 'facturacion')
      d.preparacion.facturacion = {
        tipo: 'FACTURA',
        tipoDocumento: 'RUC',
        numeroDocumento: '1',
      };
    await post(d).expect(400);
    expect(await prisma.instruccionPago.count()).toBe(n);
  });
  it.each([
    metodos + '?otro=1',
    metodos + '?otro=1&otro=2',
    base + '/operaciones/no-uuid',
    base + '/no-uuid',
  ])('rechaza filtros o identificadores %s', async (ruta) => {
    await get(ruta).expect(400);
  });
  it('rechaza JSON grande y malformado sin emitir', async () => {
    const d = await datos();
    await cliente.agente
      .post(base)
      .set('Origin', origen)
      .set('X-CSRF-Token', cliente.csrf)
      .send({ ...d, relleno: 'x'.repeat(17000) })
      .expect(413);
    await cliente.agente
      .post(base)
      .set('Origin', origen)
      .set('X-CSRF-Token', cliente.csrf)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
  });
  it('normaliza NFC/UUID y ordena artículos para repetir sin otra emisión', async () => {
    const d = await datos();
    d.preparacion.articulos = [
      { sku: skuOtro, cantidad: 1, precioUnitarioEsperado: '99.99' },
      { sku, cantidad: 2, precioUnitarioEsperado: '99.99' },
    ];
    d.preparacion.cotizacion.total = '299.97';
    d.preparacion.contacto.nombres = 'Ana Mari\u0301a';
    const r = await post(d).expect(201),
      n = await prisma.instruccionPago.count();
    d.claveSolicitud = d.claveSolicitud.toUpperCase();
    d.claveCreacionPedido = d.claveCreacionPedido.toUpperCase();
    d.preparacion.articulos.reverse();
    d.preparacion.contacto.nombres = 'Ana María';
    expect((await post(d).expect(200)).body).toEqual(r.body);
    expect(await prisma.instruccionPago.count()).toBe(n);
  });
  it('una clave con otro cuerpo o propietario produce conflicto y no revela la respuesta', async () => {
    const d = await datos(),
      r = await post(d).expect(201);
    d.preparacion.contacto.nombres = 'Otra persona';
    await post(d).expect(409);
    await post(d, otro).expect(409);
    await get(base + '/operaciones/' + d.claveSolicitud, otro).expect(404);
    await get(base + '/' + r.body.instruccionId, admin).expect(404);
  });
  it('admite varias emisiones propias del checkout antes de su recepción y bloquea otro propietario', async () => {
    const d = await datos();
    await post(d).expect(201);
    const otra = { ...d, claveSolicitud: randomUUID(), metodo: 'PLIN' };
    await post(otra).expect(201);
    await post({ ...otra, claveSolicitud: randomUUID() }, otro).expect(409);
  });
  it('serializa el primer propietario de una clave de checkout y las emisiones repetidas concurrentes', async () => {
    const d = await datos(),
      n = await prisma.instruccionPago.count();
    const r = await Promise.all([
      post(d),
      post({ ...d, claveSolicitud: randomUUID() }, otro),
    ]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await prisma.instruccionPago.count()).toBe(n + 1);
    const nuevo = await datos(),
      dos = await Promise.all([post(nuevo), post(nuevo)]);
    expect(dos.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 201]);
    expect(dos[0].body).toEqual(dos[1].body);
  });
  it('no emite una instrucción nueva después de recibir esa compra, pero recupera la anterior', async () => {
    const d = await datos(),
      r = await post(d).expect(201);
    await prisma.recepcionCompra.create({
      data: {
        referencia: 'REC-' + randomBytes(8).toString('hex').toUpperCase(),
        instruccionId: r.body.instruccionId as string,
        claveCreacionPedido: d.claveCreacionPedido,
        claveSolicitud: randomUUID(),
        solicitudHash: 'a'.repeat(64),
        motivos: [],
      },
    });
    await post({ ...d, claveSolicitud: randomUUID() }).expect(409);
    expect((await post(d).expect(200)).body).toEqual(r.body);
  });
  it('recupera respuesta perdida tras COMMIT sin otra emisión', async () => {
    const d = await datos();
    perder = d.claveSolicitud;
    await expect(post(d)).rejects.toThrow();
    const r = await get(base + '/operaciones/' + d.claveSolicitud).expect(200),
      n = await prisma.instruccionPago.count();
    expect((await post(d).expect(200)).body).toEqual(r.body);
    expect(await prisma.instruccionPago.count()).toBe(n);
  });
  it('conserva destino, importe y preparación después de cambios y durante una pausa', async () => {
    const d = await datos(),
      r = await post(d).expect(201);
    await publicar({ yape: false, plin: false, celular: '955555555' });
    activa = false;
    expect((await post(d).expect(200)).body).toEqual(r.body);
    expect(
      (await get(base + '/' + r.body.instruccionId).expect(200)).body,
    ).toEqual(r.body);
    expect(
      (await request(app.getHttpServer()).get(metodos).expect(200)).body
        .metodos,
    ).toEqual([]);
    await post(await datos()).expect(503);
    activa = true;
    await publicar();
  });
  it.each([
    'precio',
    'stock',
    'variante',
    'producto',
    'marca',
    'categoria',
    'total',
    'contador',
  ])(
    'rechaza preparación con %s cambiado sin reservar ni insertar',
    async (caso) => {
      const d = await datos(),
        n = await prisma.instruccionPago.count();
      try {
        if (caso === 'precio')
          await prisma.producto.update({
            where: { id: productoId },
            data: { precio: '120.00' },
          });
        if (caso === 'stock')
          await prisma.variante.update({
            where: { id: varianteId },
            data: { existencias: 1 },
          });
        if (caso === 'variante')
          await prisma.variante.update({
            where: { id: varianteId },
            data: { habilitada: false },
          });
        if (caso === 'producto')
          await prisma.producto.update({
            where: { id: productoId },
            data: { estado: 'ARCHIVADO' },
          });
        if (caso === 'marca')
          await prisma.marca.update({
            where: { id: marcaId },
            data: { activa: false },
          });
        if (caso === 'categoria')
          await prisma.categoria.update({
            where: { id: categoriaId },
            data: { activa: false },
          });
        if (caso === 'total') d.preparacion.cotizacion.total = '1.00';
        if (caso === 'contador')
          await prisma.variante.update({
            where: { id: varianteId },
            data: { cantidadReservada: 1 },
          });
        const r = await post(d);
        expect([409, 422]).toContain(r.status);
        if (caso === 'contador')
          expect(r.body.codigo).toBe('INVENTARIO_INCONSISTENTE');
        expect(await prisma.instruccionPago.count()).toBe(n);
      } finally {
        await prisma.producto.update({
          where: { id: productoId },
          data: { precio: '99.99', estado: 'PUBLICADO' },
        });
        await prisma.variante.update({
          where: { id: varianteId },
          data: { existencias: 10, habilitada: true, cantidadReservada: 0 },
        });
        await prisma.marca.update({
          where: { id: marcaId },
          data: { activa: true },
        });
        await prisma.categoria.update({
          where: { id: categoriaId },
          data: { activa: true },
        });
      }
    },
  );
  it.each([
    'la-esperanza',
    'trujillo',
    'el-porvenir',
    'florencia-de-mora',
    'victor-larco',
    'huanchaco',
    'moche',
  ])(
    'verifica el distrito %s con su tarifa y plazo del servidor',
    async (codigo) => {
      const z = zonas.find((z) => z.codigo === codigo)!,
        costo = codigo === 'la-esperanza' ? '0.00' : '6.00';
      try {
        await prisma.zonaEntrega.update({
          where: { codigo },
          data: { habilitada: true, tarifa: costo, plazo: 'Dos días' },
        });
        const d = await datos();
        d.preparacion.entrega.distrito = codigo;
        d.preparacion.cotizacion = {
          costoEnvio: costo,
          plazoEntrega: 'Dos días',
          total: codigo === 'la-esperanza' ? '199.98' : '205.98',
        };
        const r = await post(d).expect(201);
        expect(r.body.verificacion.distritoNombre).toBe(z.nombre);
        expect(r.body.verificacion.costoEnvio).toBe(costo);
      } finally {
        await prisma.zonaEntrega.update({
          where: { codigo },
          data: {
            habilitada: z.habilitada,
            tarifa: z.tarifa,
            plazo: z.plazo,
            actualizadoEn: z.actualizadoEn,
          },
        });
      }
    },
  );
  it.each(['deshabilitada', 'sin-tarifa', 'tarifa', 'plazo'])(
    'rechaza cobertura %s anterior a transferir',
    async (caso) => {
      const z = zonas.find((z) => z.codigo === 'moche')!;
      try {
        await prisma.zonaEntrega.update({
          where: { codigo: 'moche' },
          data: {
            habilitada: caso !== 'deshabilitada',
            tarifa: caso === 'sin-tarifa' ? null : '6.00',
            plazo: caso === 'plazo' ? 'Nuevo plazo' : null,
          },
        });
        const d = await datos();
        d.preparacion.entrega.distrito = 'moche';
        d.preparacion.cotizacion = {
          costoEnvio: caso === 'tarifa' ? '7.00' : '6.00',
          plazoEntrega: null,
          total: '205.98',
        };
        const r = await post(d);
        expect([409, 422]).toContain(r.status);
      } finally {
        await prisma.zonaEntrega.update({
          where: { codigo: 'moche' },
          data: {
            habilitada: z.habilitada,
            tarifa: z.tarifa,
            plazo: z.plazo,
            actualizadoEn: z.actualizadoEn,
          },
        });
      }
    },
  );
  it('una segunda línea sin stock no reserva la primera', async () => {
    const d = await datos();
    d.preparacion.articulos.push({
      sku: skuOtro,
      cantidad: 11,
      precioUnitarioEsperado: '99.99',
    });
    d.preparacion.cotizacion.total = '1299.87';
    const antes = await negocio();
    await post(d).expect(409);
    expect(await negocio()).toEqual(antes);
  });
  it('emite QR confirmado sin consultar Cloudinary y mantiene su versión histórica', async () => {
    const ahora = new Date(),
      qr = await prisma.archivoQrPago.create({
        data: {
          metodo: 'YAPE',
          estado: 'DISPONIBLE',
          claveCarga: randomUUID(),
          solicitudHash: 'a'.repeat(64),
          hashContenido: 'b'.repeat(64),
          cloudName: 'sintetico',
          publicId: 'qr-instrucciones',
          assetId: 'qr-instrucciones-asset',
          versionCloudinary: 17n,
          urlEntrega:
            'https://res.cloudinary.com/sintetico/image/upload/v17/qr-instrucciones.png',
          carpetaCloudinary: 'SOHO/pagos/yape/prueba',
          nombreOriginal: 'qr.png',
          formato: 'png',
          ancho: 128,
          alto: 128,
          bytes: 100,
          creadoPorId: admin.id!,
          creadoEn: ahora,
          confirmadoEn: ahora,
        },
      });
    await publicar({ qrId: qr.id });
    const d = await datos(),
      r = await post(d).expect(201);
    expect(r.body.destino.qr).toMatchObject({
      id: qr.id,
      url: qr.urlEntrega,
      formato: 'png',
      ancho: 128,
      alto: 128,
    });
    await publicar();
    expect(
      (await get(base + '/' + r.body.instruccionId).expect(200)).body,
    ).toEqual(r.body);
    expect(externo).not.toHaveBeenCalled();
  });
  it('publicación simultánea espera la emisión y conserva un único destino/versionado', async () => {
    const d = await datos(),
      entrada = puerta(),
      salida = puerta(),
      p = app.get(PreparacionPedidoService),
      original = p.verificar.bind(p);
    vi.spyOn(p, 'verificar').mockImplementationOnce(async (tx, datos) => {
      entrada.abrir();
      await salida.promesa;
      return original(tx, datos);
    });
    const emitir = post(d).then((r) => r);
    await entrada.promesa;
    const cambio = publicar({ celular: '955555555' });
    salida.abrir();
    const r = await emitir;
    expect(r.status).toBe(201);
    await cambio;
    expect(r.body.destino.celular).toBe('987654321');
    expect(
      (await get(base + '/' + r.body.instruccionId).expect(200)).body,
    ).toEqual(r.body);
    await post({ ...d, claveSolicitud: randomUUID() }).expect(409);
    await publicar();
  });
  it('revocación mientras espera la preparación impide insertar', async () => {
    const c = await cuenta('CLIENTE'),
      d = await datos(),
      identidad = await contexto(c),
      entrada = puerta(),
      salida = puerta(),
      p = app.get(PreparacionPedidoService),
      original = p.verificar.bind(p),
      n = await prisma.instruccionPago.count();
    vi.spyOn(p, 'verificar').mockImplementationOnce(async (tx, datos) => {
      entrada.abrir();
      await salida.promesa;
      return original(tx, datos);
    });
    const tarea = app.get(InstruccionesPagoService).emitir(d, identidad);
    await entrada.promesa;
    await prisma.sesion.updateMany({
      where: { usuarioId: c.id },
      data: { revocadaEn: new Date() },
    });
    salida.abrir();
    await expect(tarea).rejects.toThrow('La sesión ya no autoriza');
    expect(await prisma.instruccionPago.count()).toBe(n);
  });
  it('el contenido persistido incompleto no se inventa al recuperar', async () => {
    const d = await datos(),
      r = await post(d).expect(201);
    await prisma.instruccionPago.update({
      where: { id: r.body.instruccionId as string },
      data: { respuesta: { destino: 'dañado' } },
    });
    const e = await get(base + '/' + r.body.instruccionId).expect(503);
    expect(e.body.message).toContain('requiere revisión');
  });
  it('el acceso invitado vencido no expone su instrucción ni se renueva por repetir', async () => {
    const c = await cuenta(),
      d = await datos(),
      r = await post(d, c).expect(201);
    await prisma.instruccionPago.update({
      where: { id: r.body.instruccionId as string },
      data: { emitidaEn: new Date(Date.now() - 31 * 86400000) },
    });
    await get(base + '/' + r.body.instruccionId, c).expect(404);
    await post(d, c).expect(404);
  });
  it('aplica el límite de consultas y de emisión con respuesta 429 sin escritura', async () => {
    const d = await datos(),
      n = await prisma.instruccionPago.count();
    limites.comprobar.mockImplementationOnce((_tipo, _req, res) => {
      res.setHeader('Retry-After', '60');
      throw new HttpException('Demasiados intentos', 429);
    });
    const r = await post(d).expect(429);
    expect(r.headers['retry-after']).toBe('60');
    expect(await prisma.instruccionPago.count()).toBe(n);
  });
  it('conserva huella v1 y permite recuperar el pedido confirmado cuando se activa el circuito nuevo', async () => {
    activa = false;
    const d = await datosPedido(sku);
    const r = await cliente.agente
      .post('/api/pedidos')
      .set('Origin', origen)
      .set('X-CSRF-Token', cliente.csrf)
      .send(d)
      .expect(201);
    const original = createHash('sha256')
      .update(
        JSON.stringify({
          claveCreacion: d.claveCreacion,
          contacto: d.contacto,
          entrega: d.entrega,
          facturacion: d.facturacion,
          articulos: d.articulos,
          cotizacion: d.cotizacion,
          metodoPago: d.metodoPago,
          comprobante: {
            ...d.comprobante,
            contenidoBase64: createHash('sha256')
              .update(Buffer.from(d.comprobante.contenidoBase64, 'base64'))
              .digest('hex'),
          },
          usuarioId: cliente.id,
        }),
      )
      .digest('hex');
    expect(
      (
        await prisma.pedido.findUniqueOrThrow({
          where: { claveCreacion: d.claveCreacion },
        })
      ).solicitudHash,
    ).toBe(original);
    activa = true;
    const previo = await negocio();
    expect(
      (
        await cliente.agente
          .post('/api/pedidos')
          .set('Origin', origen)
          .set('X-CSRF-Token', cliente.csrf)
          .send(d)
          .expect(200)
      ).body.pedido,
    ).toEqual(r.body.pedido);
    expect(await negocio()).toEqual(previo);
    const nuevo = await datosPedido(sku);
    const error = await cliente.agente
      .post('/api/pedidos')
      .set('Origin', origen)
      .set('X-CSRF-Token', cliente.csrf)
      .send(nuevo)
      .expect(409);
    expect(error.body.codigo).toBe('INSTRUCCION_PAGO_REQUERIDA');
    const emitir = await datos();
    emitir.claveCreacionPedido = d.claveCreacion;
    await post(emitir).expect(409);
  });
});
