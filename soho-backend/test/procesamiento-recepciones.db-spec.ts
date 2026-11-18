import { Test } from '@nestjs/testing';
import {
  HttpException,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
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
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { ComprobantesPrivadosService } from '../src/pedidos/archivos/comprobantes-privados.service.js';
import {
  ConfiguracionCloudinary,
  HTTP_CLOUDINARY,
} from '../src/productos/fotografias/configuracion-cloudinary.js';
import { ProcesamientoRecepcionService } from '../src/pagos/recepciones/procesamiento-recepcion.service.js';
import { PreparacionPedidoService } from '../src/pedidos/preparacion/preparacion-pedido.service.js';
import { RegistroPedidoService } from '../src/pedidos/preparacion/registro-pedido.service.js';
import { RespuestaProcesamientoRecepcion } from '../src/pagos/recepciones/respuesta-procesamiento-recepcion.js';
import { datosPedido } from './pedidos-fixtures.js';

const valor = process.env.TEST_PROCESAMIENTO_DATABASE_URL;
if (!valor)
  throw Error(
    'Recepciones exige TEST_PROCESAMIENTO_DATABASE_URL local, exclusiva y migrada.',
  );
const destino = new URL(obtenerUrlBaseDatos(valor));
if (
  !['127.0.0.1', 'localhost'].includes(destino.hostname) ||
  !destino.pathname.endsWith('_test')
)
  throw Error('Recepciones solo usa una base local _test.');
const prisma = crearClientePrisma(valor),
  auth = crearConfiguracionAuth({}),
  limites = { comprobar: vi.fn() },
  externo = vi
    .fn<typeof fetch>()
    .mockRejectedValue(Error('Proveedor real prohibido'));
const origen = 'http://localhost:4200',
  base = '/api/pagos/recepciones',
  sku = 'REC-API-BL-40P5',
  clave = 'Clave sintética recepción 2026';
type Cuenta = {
  agente: ReturnType<typeof request.agent>;
  csrf: string;
  id?: string;
  correo?: string;
  secreto?: string;
};
type Solicitud = {
  claveSolicitud: string;
  instruccionPagoId: string;
  comprobante: Awaited<ReturnType<typeof datosPedido>>['comprobante'];
};
let app: INestApplication,
  privado: string,
  admin: Cuenta,
  cliente: Cuenta,
  otro: Cuenta,
  activa = true,
  productoId: string;
let perder: string | undefined;
function puerta() {
  let abrir!: () => void;
  const promesa = new Promise<void>((r) => {
    abrir = r;
  });
  return { abrir, promesa };
}
async function cuenta(rol?: 'ADMIN' | 'CLIENTE'): Promise<Cuenta> {
  const agente = request.agent(app.getHttpServer()),
    csrf = (await agente.get('/api/auth/csrf').expect(200)).body
      .csrfToken as string;
  if (!rol) return { agente, csrf, secreto: randomBytes(32).toString('hex') };
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Recepciones',
      correo: randomUUID() + '@recepciones.test',
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
  return {
    agente,
    csrf: r.body.csrfToken as string,
    id: u.id,
    correo: u.correo,
  };
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
async function publicar(activo = true) {
  const actual = await admin.agente
    .get('/api/admin/configuracion/pagos')
    .expect(200);
  await admin.agente
    .patch('/api/admin/configuracion/pagos')
    .set('Origin', origen)
    .set('X-CSRF-Token', admin.csrf)
    .send({
      claveSolicitud: randomUUID(),
      versionEsperada: actual.body.configuracion.version,
      confirmado: true,
      metodos: ['YAPE', 'PLIN'].map((metodo) => ({
        metodo,
        activo,
        celular: '987654321',
        titular: 'SOHO sintético',
        qrId: null,
      })),
    })
    .expect(200);
}
async function solicitud(
  c = cliente,
  modificar?: (p: Awaited<ReturnType<typeof datosPedido>>) => void,
  metodo = 'YAPE',
): Promise<Solicitud> {
  const p = await datosPedido(sku);
  modificar?.(p);
  const configuracion = await prisma.configuracionPagos.findUniqueOrThrow({
    where: { id: 1 },
    include: { versionActual: true },
  });
  const q = c.agente
    .post('/api/pagos/instrucciones')
    .set('Origin', origen)
    .set('X-CSRF-Token', c.csrf);
  if (c.secreto) q.set('X-Pedido-Acceso', c.secreto);
  const r = await q
    .send({
      claveSolicitud: randomUUID(),
      claveCreacionPedido: p.claveCreacion,
      metodo,
      versionConfiguracionEsperada: configuracion.versionActual!.numero,
      preparacion: {
        contacto: p.contacto,
        entrega: p.entrega,
        facturacion: p.facturacion,
        articulos: p.articulos,
        cotizacion: p.cotizacion,
      },
    })
    .expect(201);
  return {
    claveSolicitud: randomUUID(),
    instruccionPagoId: r.body.instruccionId as string,
    comprobante: p.comprobante,
  };
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
        apellidos: 'Recepciones',
        correo: c.correo!,
        rol: 'CLIENTE' as const,
        correoVerificado: false,
      },
    },
  };
}
async function negocio() {
  const tablas = await prisma.$queryRaw<
    Array<{ nombre: string }>
  >`SELECT TABLE_NAME nombre FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME NOT IN ('_prisma_migrations','recepciones_compra','comprobantes_recepcion_compra','operaciones_recepcion_compra','sesiones') ORDER BY TABLE_NAME`;
  const salida: Record<string, string[]> = {};
  for (const { nombre } of tablas) {
    expect(nombre).toMatch(/^[a-z_]+$/);
    const filas = await prisma.$queryRawUnsafe<unknown[]>(
      'SELECT * FROM `' + nombre + '`',
    );
    salida[nombre] = filas
      .map((x) =>
        JSON.stringify(x, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
      )
      .sort();
  }
  return salida;
}

async function recibida(
  c = cliente,
  modificar?: Parameters<typeof solicitud>[1],
  metodo = 'YAPE',
) {
  const d = await solicitud(c, modificar, metodo),
    r = await post(d, c).expect(201);
  return {
    d,
    id: r.body.recepcion.id as string,
    inicial: r.body,
    datos: {
      claveSolicitud: randomUUID(),
      versionEsperada: r.body.recepcion.version as number,
    },
  };
}
function procesar(
  f: Awaited<ReturnType<typeof recibida>>,
  c = cliente,
  datos: unknown = f.datos,
) {
  const q = c.agente
    .post(base + '/' + f.id + '/procesamiento')
    .set('Origin', origen)
    .set('X-CSRF-Token', c.csrf);
  if (c.secreto) q.set('X-Pedido-Acceso', c.secreto);
  return q.send(datos as object);
}
function recuperar(f: Awaited<ReturnType<typeof recibida>>, c = cliente) {
  return get(base + '/' + f.id + '/operaciones/' + f.datos.claveSolicitud, c);
}
async function operacion(f: Awaited<ReturnType<typeof recibida>>) {
  return prisma.operacionRecepcionCompra.findUniqueOrThrow({
    where: { claveSolicitud: f.datos.claveSolicitud },
  });
}
async function revision(f: Awaited<ReturnType<typeof recibida>>) {
  const o = await operacion(f);
  await prisma.operacionRecepcionCompra.update({
    where: { id: o.id },
    data: {
      proximaRevisionEn: new Date(),
      bloqueoProcesoHasta: o.tokenProceso ? new Date(Date.now() - 1) : null,
    },
  });
}
async function cantidades() {
  return Promise.all([
    prisma.pedido.count(),
    prisma.pagoPedido.count(),
    prisma.reservaInventario.count(),
    prisma.comprobantePago.count(),
    prisma.movimientoInventario.count(),
  ]);
}
describe.sequential('Procesamiento con HTTP, disco y MySQL temporal', () => {
  beforeAll(async () => {
    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.recepcionCompra.count()).toBe(0);
    privado = await mkdtemp(path.join(tmpdir(), 'soho-procesamiento-test-'));
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
    app = m.createNestApplication({ bodyParser: false, logger: false });
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
            req.path.endsWith('/procesamiento') &&
            req.method === 'POST' &&
            req.body?.claveSolicitud === perder &&
            res.statusCode === 200
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
    await publicar();
    const marca = await prisma.marca.create({
        data: {
          codigo: 'REC',
          nombre: 'Marca recepciones',
          slug: 'marca-recepciones',
        },
      }),
      categoria = await prisma.categoria.create({
        data: {
          nombre: 'Categoría recepciones',
          slug: 'categoria-recepciones',
        },
      }),
      talla = await prisma.talla.create({ data: { valor: '40.5' } });
    const p = await prisma.producto.create({
      data: {
        codigoInterno: 'REC-001',
        slug: 'producto-recepciones',
        nombre: 'Producto recepciones',
        modelo: 'Modelo recibo',
        codigoModelo: 'RECIBO',
        precio: '99.99',
        estado: 'PUBLICADO',
        marcaId: marca.id,
        categoriaId: categoria.id,
        imagenes: {
          create: { ruta: '/imagenes/productos/recibo.png', orden: 0 },
        },
        colores: {
          create: {
            codigo: 'BL',
            nombre: 'Blanco',
            hexadecimal: '#FFFFFF',
            variantes: {
              create: { sku, tallaId: talla.id, existencias: 10 },
            },
          },
        },
      },
    });
    productoId = p.id;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    limites.comprobar.mockReset();
    activa = true;
    await prisma.producto.update({
      where: { id: productoId },
      data: { precio: '99.99', estado: 'PUBLICADO' },
    });
    for (const v of await prisma.variante.findMany())
      await prisma.variante.update({
        where: { id: v.id },
        data: { existencias: v.cantidadReservada + 10, habilitada: true },
      });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    expect(externo).not.toHaveBeenCalled();
    await app?.close();
    await prisma.$disconnect();
    if (privado) {
      const real = await realpath(privado);
      expect(real.startsWith(await realpath(tmpdir()))).toBe(true);
      expect(path.basename(real)).toMatch(/^soho-procesamiento-test-/);
      await rm(real, { recursive: true, force: true });
    }
  });

  it('crea pedido, pago pendiente, copia de origen y reservas completas en una transacción', async () => {
    const f = await recibida(),
      antes = await cantidades(),
      fuente = await prisma.comprobanteRecepcionCompra.findFirstOrThrow({
        where: { recepcionId: f.id },
      }),
      inicial = await prisma.recepcionCompra.findUniqueOrThrow({
        where: { id: f.id },
      }),
      variante = await prisma.variante.findUniqueOrThrow({ where: { sku } }),
      r = await procesar(f).expect(200),
      o = await operacion(f),
      despues = await cantidades();
    expect(r.body.resultado).toBe('PEDIDO_CREADO');
    expect(r.body.operacion.estado).toBe('CONFIRMADA');
    expect(r.body.recepcion).toMatchObject({
      estado: 'PEDIDO_CREADO',
      version: 3,
    });
    expect(despues.map((n, i) => n - antes[i])).toEqual([1, 1, 1, 1, 0]);
    const p = await prisma.pedido.findUniqueOrThrow({
      where: { codigo: r.body.pedido.codigo as string },
      include: {
        articulos: { include: { unidades: true, reservas: true } },
        pago: { include: { comprobantes: true } },
        eventos: true,
      },
    });
    expect(p.total.toFixed(2)).toBe('199.98');
    expect(p.usuarioId).toBe(cliente.id);
    expect(p.pago).toMatchObject({
      metodo: 'YAPE',
      estado: 'PENDIENTE',
      instruccionId: f.d.instruccionPagoId,
    });
    expect(p.articulos[0].unidades).toHaveLength(2);
    expect(p.articulos[0].reservas[0]).toMatchObject({
      cantidad: 2,
      estado: 'ACTIVA',
    });
    expect(p.eventos.map((e) => e.tipo)).toEqual([
      'CREADO',
      'COMPROBANTE_ADJUNTADO',
      'RESERVA_CREADA',
    ]);
    const c = p.pago!.comprobantes[0];
    expect(c.comprobanteRecepcionId).toBe(fuente.id);
    expect(c.archivoClave).not.toBe(fuente.archivoClave);
    expect(c.archivoSha256).toBe(fuente.archivoSha256);
    expect(c.tamanoBytes).toBe(fuente.tamanoBytes);
    expect(c.numeroOperacion).toBe('001234');
    expect(await readFile(path.join(privado, c.archivoClave))).toEqual(
      await readFile(path.join(privado, fuente.archivoClave)),
    );
    expect(
      (await prisma.variante.findUniqueOrThrow({ where: { sku } }))
        .cantidadReservada,
    ).toBe(variante.cantidadReservada + 2);
    expect(
      (await prisma.variante.findUniqueOrThrow({ where: { sku } })).existencias,
    ).toBe(variante.existencias);
    expect(o).toMatchObject({
      estado: 'CONFIRMADA',
      codigoHttp: 200,
      versionEsperada: 2,
      versionResultante: 3,
      archivoPedidoEstado: 'DISPONIBLE',
      tokenProceso: null,
    });
    expect(
      (await prisma.recepcionCompra.findUniqueOrThrow({ where: { id: f.id } }))
        .respuesta,
    ).toEqual(inicial.respuesta);
    expect(
      (
        await prisma.instruccionPago.findUniqueOrThrow({
          where: { id: f.d.instruccionPagoId },
        })
      ).pedidoId,
    ).toBe(p.id);
    expect((await post(f.d).expect(200)).body).toEqual(f.inicial);
    expect(
      (await get(base + '/' + f.id).expect(200)).body.recepcion.estado,
    ).toBe('PEDIDO_CREADO');
    const n = await cantidades();
    expect((await procesar(f).expect(200)).body).toEqual(r.body);
    expect((await recuperar(f).expect(200)).body).toEqual(r.body);
    expect(await cantidades()).toEqual(n);
  });
  it('otro intento del pedido creado devuelve su operación canónica sin duplicar', async () => {
    const f = await recibida(),
      r = await procesar(f).expect(200),
      n = await cantidades();
    const d = { ...f.datos, claveSolicitud: randomUUID() };
    expect((await procesar(f, cliente, d).expect(200)).body).toEqual(r.body);
    expect(await cantidades()).toEqual(n);
    await get(base + '/' + f.id + '/operaciones/' + d.claveSolicitud).expect(
      404,
    );
  });
  it('usa la política de reservas vigente al registrar, posterior a emisión y recepción', async () => {
    const f = await recibida(),
      p = await prisma.configuracionReserva.findUniqueOrThrow({
        where: { id: 1 },
      });
    try {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: {
          version: { increment: 1 },
          modo: 'TIEMPO',
          horas: 2,
          accionVencimiento: 'LIBERAR_Y_ALERTAR',
        },
      });
      const r = await procesar(f).expect(200),
        reserva = await prisma.reservaInventario.findFirstOrThrow({
          where: {
            articulo: {
              pedido: { codigo: r.body.pedido.codigo as string },
            },
          },
        });
      expect(reserva.modo).toBe('TIEMPO');
      expect(reserva.horas).toBe(2);
      expect(reserva.configuracionVersion).toBe(p.version + 1);
      expect(reserva.venceEn!.getTime() - reserva.creadoEn.getTime()).toBe(
        2 * 3600000,
      );
    } finally {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: {
          modo: p.modo,
          horas: p.horas,
          version: p.version,
          accionVencimiento: p.accionVencimiento,
        },
      });
    }
  });
  it('acepta método desactivado y nuevas emisiones pausadas conservando el destino histórico', async () => {
    const f = await recibida(cliente, undefined, 'PLIN');
    await publicar(false);
    activa = false;
    const r = await procesar(f).expect(200);
    expect(r.body.recepcion.instruccion.metodo).toBe('PLIN');
    expect(r.body.resultado).toBe('PEDIDO_CREADO');
    await publicar();
  });
  it('invitado conserva propiedad y obtiene otro plazo de acceso desde creación del pedido', async () => {
    const c = await cuenta(),
      f = await recibida(c),
      r = await procesar(f, c).expect(200),
      p = await prisma.pedido.findUniqueOrThrow({
        where: { codigo: r.body.pedido.codigo as string },
      });
    expect(p.usuarioId).toBeNull();
    expect(p.accesoInvitadoHash).toBe(
      createHash('sha256').update(c.secreto!).digest('hex'),
    );
    expect(p.accesoInvitadoExpiraEn!.getTime() - p.creadoEn.getTime()).toBe(
      30 * 86400000,
    );
    expect((await recuperar(f, c).expect(200)).body).toEqual(r.body);
    await recuperar(f, cliente).expect(404);
    await recuperar(f, admin).expect(404);
    await get('/api/pedidos/' + p.codigo, c).expect(200);
  });
  it.each(['precio', 'stock', 'producto', 'variante', 'contador', 'identidad'])(
    'conserva evidencia y registra atención por %s sin modificar otras tablas',
    async (caso) => {
      const f = await recibida(),
        v = await prisma.variante.findUniqueOrThrow({ where: { sku } });
      if (caso === 'precio')
        await prisma.producto.update({
          where: { id: productoId },
          data: { precio: '120.00' },
        });
      if (caso === 'stock')
        await prisma.variante.update({
          where: { id: v.id },
          data: { existencias: v.cantidadReservada + 1 },
        });
      if (caso === 'producto')
        await prisma.producto.update({
          where: { id: productoId },
          data: { estado: 'ARCHIVADO' },
        });
      if (caso === 'variante')
        await prisma.variante.update({
          where: { id: v.id },
          data: { habilitada: false },
        });
      if (caso === 'contador')
        await prisma.variante.update({
          where: { id: v.id },
          data: { cantidadReservada: v.cantidadReservada + 1 },
        });
      if (caso === 'identidad') {
        const i = await prisma.instruccionPago.findUniqueOrThrow({
            where: { id: f.d.instruccionPagoId },
          }),
          q = i.respuesta as any;
        q.verificacion.articulos[0].varianteId = randomUUID();
        await prisma.instruccionPago.update({
          where: { id: i.id },
          data: { respuesta: q },
        });
        const rr = await prisma.recepcionCompra.findUniqueOrThrow({
            where: { id: f.id },
          }),
          b = rr.respuesta as any;
        b.recepcion.instruccion = q;
        await prisma.recepcionCompra.update({
          where: { id: f.id },
          data: { respuesta: b },
        });
      }
      try {
        const antes = await negocio(),
          n = await cantidades(),
          r = await procesar(f).expect(200);
        expect(r.body.resultado).toBe('REQUIERE_ATENCION');
        expect(r.body.pedido).toBeNull();
        expect(r.body.recepcion.motivos).toHaveLength(1);
        expect(await cantidades()).toEqual(n);
        expect(await negocio()).toEqual(antes);
        expect((await recuperar(f).expect(200)).body).toEqual(r.body);
        await procesar(f, cliente, {
          ...f.datos,
          claveSolicitud: randomUUID(),
          versionEsperada: 3,
        }).expect(409);
        const c = await prisma.comprobanteRecepcionCompra.findFirstOrThrow({
          where: { recepcionId: f.id },
        });
        expect(c.pagoDestinoId).toBeNull();
        expect(await readFile(path.join(privado, c.archivoClave))).toHaveLength(
          c.tamanoBytes,
        );
      } finally {
        if (caso === 'contador')
          await prisma.variante.update({
            where: { id: v.id },
            data: { cantidadReservada: v.cantidadReservada },
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
    'procesa el distrito %s y conserva tarifa/plazo históricos',
    async (distrito) => {
      const z = await prisma.zonaEntrega.findUniqueOrThrow({
          where: { codigo: distrito },
        }),
        tarifa = distrito === 'la-esperanza' ? '0.00' : '6.00';
      try {
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { habilitada: true, tarifa, plazo: 'Prueba distrito' },
        });
        const f = await recibida(cliente, (p) => {
          p.entrega.distrito = distrito;
          p.cotizacion = {
            costoEnvio: tarifa,
            plazoEntrega: 'Prueba distrito',
            total: tarifa === '0.00' ? '199.98' : '205.98',
          };
        });
        const r = await procesar(f).expect(200),
          p = await prisma.pedido.findUniqueOrThrow({
            where: { codigo: r.body.pedido.codigo as string },
          });
        expect(p.distritoCodigo).toBe(distrito);
        expect(p.costoEnvio.toFixed(2)).toBe(tarifa);
        expect(p.plazoEntrega).toBe('Prueba distrito');
      } finally {
        await prisma.zonaEntrega.update({
          where: { id: z.id },
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
  it.each(['habilitada', 'tarifa', 'plazo', 'pendiente'])(
    'cobertura cambiada (%s) deriva a atención sin reserva',
    async (caso) => {
      const z = await prisma.zonaEntrega.findUniqueOrThrow({
        where: { codigo: 'trujillo' },
      });
      try {
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { habilitada: true, tarifa: '6.00', plazo: null },
        });
        const f = await recibida(cliente, (p) => {
          p.entrega.distrito = 'trujillo';
          p.cotizacion.costoEnvio = '6.00';
          p.cotizacion.total = '205.98';
        });
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data:
            caso === 'habilitada'
              ? { habilitada: false }
              : caso === 'tarifa'
                ? { tarifa: '7.00' }
                : caso === 'plazo'
                  ? { plazo: 'Otro plazo' }
                  : { tarifa: null },
        });
        const n = await cantidades(),
          r = await procesar(f).expect(200);
        expect(r.body.resultado).toBe('REQUIERE_ATENCION');
        expect(await cantidades()).toEqual(n);
      } finally {
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { habilitada: z.habilitada, tarifa: z.tarifa, plazo: z.plazo },
        });
      }
    },
  );
  it.each([0, 1.2, '2', null, 4294967296])(
    'rechaza versión inválida %s sin reservar operación',
    async (versionEsperada) => {
      const f = await recibida(),
        n = await prisma.operacionRecepcionCompra.count();
      await procesar(f, cliente, { ...f.datos, versionEsperada }).expect(400);
      expect(await prisma.operacionRecepcionCompra.count()).toBe(n);
    },
  );
  it('rechaza estado pendiente, versión vieja, extras, consultas y falta de CSRF sin cambios', async () => {
    const f = await recibida(),
      n = await cantidades();
    await procesar(f, cliente, { ...f.datos, versionEsperada: 1 }).expect(409);
    await procesar(f, cliente, { ...f.datos, comprobante: {} }).expect(400);
    await get(
      base + '/' + f.id + '/operaciones/' + randomUUID() + '?extra=1',
    ).expect(400);
    await cliente.agente
      .post(base + '/' + f.id + '/procesamiento')
      .set('Origin', origen)
      .send(f.datos)
      .expect(403);
    const d = await solicitud();
    vi.spyOn(
      app.get(ComprobantesPrivadosService),
      'guardarReservado',
    ).mockRejectedValueOnce(new ServiceUnavailableException('Fallo sintético'));
    const p = await post(d).expect(202);
    await cliente.agente
      .post(base + '/' + p.body.recepcion.id + '/procesamiento')
      .set('Origin', origen)
      .set('X-CSRF-Token', cliente.csrf)
      .send(f.datos)
      .expect(409);
    expect(await cantidades()).toEqual(n);
  });
  it('serializa reintentos de la misma clave y bloquea otra clave mientras existe un intento pendiente', async () => {
    const f = await recibida(),
      s = app.get(ComprobantesPrivadosService),
      copiar = s.copiarReservado.bind(s),
      entrada = puerta(),
      salida = puerta(),
      n = await cantidades();
    vi.spyOn(s, 'copiarReservado').mockImplementationOnce(async (...args) => {
      entrada.abrir();
      await salida.promesa;
      await copiar(...args);
    });
    const primera = procesar(f).then((r) => r);
    await entrada.promesa;
    try {
      const segunda = await procesar(f).expect(202);
      expect(segunda.body.operacion.estado).toBe('PENDIENTE');
      expect(segunda.headers['retry-after']).toBe('5');
      await procesar(f, cliente, {
        ...f.datos,
        claveSolicitud: randomUUID(),
      }).expect(409);
      await recuperar(f).expect(202);
      expect(await cantidades()).toEqual(n);
    } finally {
      salida.abrir();
    }
    const r = await primera;
    expect(r.status).toBe(200);
    expect(r.body.resultado).toBe('PEDIDO_CREADO');
    expect((await recuperar(f).expect(200)).body).toEqual(r.body);
    expect(
      await prisma.operacionRecepcionCompra.count({
        where: { recepcionId: f.id },
      }),
    ).toBe(1);
  });
  it('reemplaza un lease vencido sin duplicar pedido ni sobrescribir la copia de otro escritor', async () => {
    const f = await recibida(),
      s = app.get(ComprobantesPrivadosService),
      copiar = s.copiarReservado.bind(s),
      entrada = puerta(),
      salida = puerta();
    vi.spyOn(s, 'copiarReservado').mockImplementationOnce(async (...args) => {
      entrada.abrir();
      await salida.promesa;
      await copiar(...args);
    });
    const primera = procesar(f).then((r) => r);
    await entrada.promesa;
    let segunda: Awaited<ReturnType<typeof procesar>>;
    try {
      await revision(f);
      segunda = await procesar(f).expect(200);
    } finally {
      salida.abrir();
    }
    expect((await primera).body).toEqual(segunda!.body);
    const o = await operacion(f);
    expect(o.intentosProceso).toBe(2);
    expect(
      await prisma.pedido.count({
        where: {
          claveCreacion: segunda!.body.recepcion.claveCreacionPedido as string,
        },
      }),
    ).toBe(1);
    expect(
      (await readdir(path.join(privado, 'comprobantes'))).filter((x) =>
        x.endsWith('.tmp'),
      ),
    ).toEqual([]);
  });
  it('dos compras compiten por las últimas unidades sin sobreventa y la otra conserva atención', async () => {
    const a = await recibida(),
      b = await recibida(),
      v = await prisma.variante.findUniqueOrThrow({ where: { sku } }),
      n = await cantidades();
    await prisma.variante.update({
      where: { id: v.id },
      data: { existencias: v.cantidadReservada + 2 },
    });
    const r = await Promise.all([procesar(a), procesar(b)]);
    expect(r.every((x) => x.status === 200)).toBe(true);
    expect(
      r
        .map((x) => x.body.resultado)
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(['PEDIDO_CREADO', 'REQUIERE_ATENCION']);
    expect((await cantidades()).map((x, i) => x - n[i])).toEqual([
      1, 1, 1, 1, 0,
    ]);
    const despues = await prisma.variante.findUniqueOrThrow({ where: { sku } });
    expect(despues.cantidadReservada).toBe(despues.existencias);
  });
  it('un error tras crear el pedido revierte vínculos, reservas y eventos y conserva fuente/copia recuperables', async () => {
    const f = await recibida(),
      n = await cantidades(),
      antes = await prisma.variante.findUniqueOrThrow({ where: { sku } });
    vi.spyOn(RespuestaProcesamientoRecepcion, 'crear').mockImplementationOnce(
      () => {
        throw new Error('Fallo sintético después de vínculos');
      },
    );
    await procesar(f).expect(503);
    expect(await cantidades()).toEqual(n);
    expect(
      (await prisma.variante.findUniqueOrThrow({ where: { sku } }))
        .cantidadReservada,
    ).toBe(antes.cantidadReservada);
    const o = await operacion(f),
      r = await prisma.recepcionCompra.findUniqueOrThrow({
        where: { id: f.id },
      });
    expect(o.estado).toBe('PENDIENTE');
    expect(o.respuesta).toBeNull();
    expect(r.estado).toBe('RECIBIDA');
    expect(
      (
        await prisma.instruccionPago.findUniqueOrThrow({
          where: { id: f.d.instruccionPagoId },
        })
      ).pedidoId,
    ).toBeNull();
    expect(
      await readFile(path.join(privado, o.archivoPedidoClave!)),
    ).toHaveLength(o.archivoPedidoBytes!);
    await revision(f);
    const final = await recuperar(f).expect(200);
    expect(final.body.resultado).toBe('PEDIDO_CREADO');
    expect((await cantidades()).map((x, i) => x - n[i])).toEqual([
      1, 1, 1, 1, 0,
    ]);
  });
  it('recupera el resultado cuando el COMMIT final se confirmó pero su retorno falló', async () => {
    const f = await recibida(),
      s = app.get(ComprobantesPrivadosService),
      copiar = s.copiarReservado.bind(s),
      e = app.get(EscrituraAutorizadaService),
      tx = e.transaccion.bind(e),
      n = await cantidades();
    vi.spyOn(s, 'copiarReservado').mockImplementationOnce(async (...args) => {
      await copiar(...args);
      vi.spyOn(e, 'transaccion').mockImplementationOnce(async (op) => {
        await tx(op);
        throw new Error('COMMIT sin retorno');
      });
    });
    const r = await procesar(f).expect(200);
    expect(r.body.resultado).toBe('PEDIDO_CREADO');
    expect((await recuperar(f).expect(200)).body).toEqual(r.body);
    expect((await cantidades()).map((x, i) => x - n[i])).toEqual([
      1, 1, 1, 1, 0,
    ]);
  });
  it('una respuesta HTTP perdida se recupera por clave sin otra copia o reserva', async () => {
    const f = await recibida();
    perder = f.datos.claveSolicitud;
    await expect(procesar(f)).rejects.toThrow();
    const n = await cantidades(),
      a = await readdir(path.join(privado, 'comprobantes')),
      r = await recuperar(f).expect(200);
    expect(r.body.resultado).toBe('PEDIDO_CREADO');
    expect((await procesar(f).expect(200)).body).toEqual(r.body);
    expect(await cantidades()).toEqual(n);
    expect(await readdir(path.join(privado, 'comprobantes'))).toEqual(a);
  });
  it('un fallo después de copiar conserva la identidad reservada y GET reanuda sin recodificar', async () => {
    const f = await recibida(),
      s = app.get(ComprobantesPrivadosService),
      copiar = s.copiarReservado.bind(s),
      n = await cantidades();
    vi.spyOn(s, 'copiarReservado').mockImplementationOnce(async (...args) => {
      await copiar(...args);
      throw new Error('Caída después de copia');
    });
    await procesar(f).expect(503);
    expect(await cantidades()).toEqual(n);
    const o = await operacion(f),
      a = await readdir(path.join(privado, 'comprobantes'));
    expect(o.estado).toBe('PENDIENTE');
    expect(o.archivoPedidoEstado).toBe('PENDIENTE');
    await recuperar(f).expect(202);
    await revision(f);
    const preparar = vi.spyOn(s, 'preparar');
    const r = await recuperar(f).expect(200);
    expect(r.body.resultado).toBe('PEDIDO_CREADO');
    expect(preparar).not.toHaveBeenCalled();
    expect(await readdir(path.join(privado, 'comprobantes'))).toEqual(a);
  });
  it.each(['ausente', 'alterado'])(
    'una fuente %s no crea pedido ni se marca como rechazo comercial',
    async (caso) => {
      const f = await recibida(),
        c = await prisma.comprobanteRecepcionCompra.findFirstOrThrow({
          where: { recepcionId: f.id },
        }),
        ruta = path.join(privado, c.archivoClave),
        bytes = await readFile(ruta),
        n = await cantidades();
      if (caso === 'ausente') await unlink(ruta);
      else await writeFile(ruta, 'alterado');
      await procesar(f).expect(503);
      expect(await cantidades()).toEqual(n);
      expect((await operacion(f)).estado).toBe('PENDIENTE');
      await writeFile(ruta, bytes);
      await revision(f);
      expect((await recuperar(f).expect(200)).body.resultado).toBe(
        'PEDIDO_CREADO',
      );
    },
  );
  it('un 5xx de base durante revisión comercial no se transforma en atención ni reserva', async () => {
    const f = await recibida(),
      n = await cantidades();
    vi.spyOn(
      app.get(PreparacionPedidoService),
      'verificar',
    ).mockRejectedValueOnce(new Error('Base no disponible'));
    await procesar(f).expect(503);
    expect(await cantidades()).toEqual(n);
    expect(
      (await prisma.recepcionCompra.findUniqueOrThrow({ where: { id: f.id } }))
        .estado,
    ).toBe('RECIBIDA');
    await revision(f);
    await recuperar(f).expect(200);
  });
  it('la clave de operación no se reutiliza con otra versión, recepción o propietario', async () => {
    const f = await recibida();
    await procesar(f).expect(200);
    await procesar(f, cliente, { ...f.datos, versionEsperada: 3 }).expect(409);
    const otra = await recibida();
    await procesar(otra, cliente, f.datos).expect(409);
    await recuperar(f, otro).expect(404);
  });
  it('revocar la sesión durante la copia conserva evidencia sin crear el pedido', async () => {
    const c = await cuenta('CLIENTE'),
      f = await recibida(c),
      s = app.get(ComprobantesPrivadosService),
      copiar = s.copiarReservado.bind(s),
      n = await cantidades();
    vi.spyOn(s, 'copiarReservado').mockImplementationOnce(async (...args) => {
      await copiar(...args);
      await prisma.sesion.updateMany({
        where: { usuarioId: c.id },
        data: { revocadaEn: new Date() },
      });
    });
    await procesar(f, c).expect(401);
    expect(await cantidades()).toEqual(n);
    expect((await operacion(f)).estado).toBe('PENDIENTE');
    const fuente = await prisma.comprobanteRecepcionCompra.findFirstOrThrow({
      where: { recepcionId: f.id },
    });
    expect(
      await readFile(path.join(privado, fuente.archivoClave)),
    ).toHaveLength(fuente.tamanoBytes);
    const agente = request.agent(app.getHttpServer()),
      csrf = (await agente.get('/api/auth/csrf').expect(200)).body
        .csrfToken as string,
      login = await agente
        .post('/api/auth/login')
        .set('Origin', origen)
        .set('X-CSRF-Token', csrf)
        .send({ correo: c.correo, clave })
        .expect(200);
    await revision(f);
    await recuperar(f, {
      ...c,
      agente,
      csrf: login.body.csrfToken as string,
    }).expect(200);
  });
  it('la respuesta confirmada permanece histórica aunque el pago se revise después', async () => {
    const f = await recibida(),
      r = await procesar(f).expect(200),
      p = await prisma.pedido.findUniqueOrThrow({
        where: { codigo: r.body.pedido.codigo as string },
        include: { pago: true },
      });
    await prisma.pagoPedido.update({
      where: { id: p.pago!.id },
      data: { estado: 'OBSERVADO', version: { increment: 1 } },
    });
    expect((await procesar(f).expect(200)).body).toEqual(r.body);
    expect((await recuperar(f).expect(200)).body).toEqual(r.body);
  });
  it('un snapshot de operación alterado no expone propiedades adicionales', async () => {
    const f = await recibida();
    await procesar(f).expect(200);
    const o = await operacion(f);
    await prisma.operacionRecepcionCompra.update({
      where: { id: o.id },
      data: { respuesta: { secreto: 'dato interno' } },
    });
    const r = await recuperar(f).expect(503);
    expect(JSON.stringify(r.body)).not.toContain('dato interno');
  });
  it('una segunda línea sin stock no reserva la primera ni crea unidades parciales', async () => {
    const v = await prisma.variante.findUniqueOrThrow({ where: { sku } }),
      t = await prisma.talla.create({ data: { valor: '41' } }),
      otra = await prisma.variante.create({
        data: {
          productoColorId: v.productoColorId,
          tallaId: t.id,
          sku: 'REC-API-BL-41',
          existencias: 10,
        },
      }),
      f = await recibida(cliente, (p) => {
        p.articulos.push({
          sku: otra.sku,
          cantidad: 2,
          precioUnitarioEsperado: '99.99',
        });
        p.cotizacion.total = '399.96';
      });
    await prisma.variante.update({
      where: { id: otra.id },
      data: { existencias: 1 },
    });
    const n = await cantidades(),
      anterior = await prisma.variante.findUniqueOrThrow({
        where: { id: v.id },
      }),
      r = await procesar(f).expect(200);
    expect(r.body.resultado).toBe('REQUIERE_ATENCION');
    expect(r.body.recepcion.motivos).toEqual(['STOCK_INSUFICIENTE']);
    expect(await cantidades()).toEqual(n);
    expect(
      (await prisma.variante.findUniqueOrThrow({ where: { id: v.id } }))
        .cantidadReservada,
    ).toBe(anterior.cantidadReservada);
  });
  it('un fallo del constructor compartido revierte el contador y permite recuperar la misma operación', async () => {
    const f = await recibida(),
      s = app.get(RegistroPedidoService),
      datos = s.datos.bind(s),
      n = await cantidades(),
      v = await prisma.variante.findUniqueOrThrow({ where: { sku } });
    vi.spyOn(s, 'datos').mockImplementationOnce(async (...args) => {
      await datos(...args);
      throw new Error('Fallo tras calcular reservas');
    });
    await procesar(f).expect(503);
    expect(await cantidades()).toEqual(n);
    expect(
      (await prisma.variante.findUniqueOrThrow({ where: { sku } }))
        .cantidadReservada,
    ).toBe(v.cantidadReservada);
    await revision(f);
    await recuperar(f).expect(200);
  });
  it('una sesión revocada antes de iniciar no reserva copia ni operación', async () => {
    const c = await cuenta('CLIENTE'),
      f = await recibida(c),
      identidad = await contexto(c),
      n = await prisma.operacionRecepcionCompra.count();
    await prisma.sesion.updateMany({
      where: { usuarioId: c.id },
      data: { revocadaEn: new Date() },
    });
    await expect(
      app.get(ProcesamientoRecepcionService).procesar(f.id, f.datos, identidad),
    ).rejects.toThrow('La sesión ya no autoriza');
    expect(await prisma.operacionRecepcionCompra.count()).toBe(n);
  });
  it('procesa producto por modelo/color y protege la fotografía histórica con su FK', async () => {
    const anterior = await prisma.producto.findUniqueOrThrow({
        where: { id: productoId },
      }),
      ahora = new Date(),
      grupo = await prisma.grupoModelo.create({
        data: {
          marcaId: anterior.marcaId,
          codigoModelo: 'PROCPRUEBA',
          modelo: 'Modelo procesado',
          slugCarpeta: 'modelo-procesado',
        },
      }),
      p = await prisma.producto.create({
        data: {
          codigoInterno: 'REC-002',
          slug: 'modelo-procesado-negro',
          nombre: 'Modelo procesado Negro',
          modelo: 'Modelo procesado',
          codigoModelo: 'PROCPRUEBA',
          marcaId: anterior.marcaId,
          categoriaId: anterior.categoriaId,
          grupoModeloId: grupo.id,
          codigoColor: 'NG',
          colorNombre: 'Negro',
          colorHexadecimal: '#000000',
          precio: '99.99',
          estado: 'PUBLICADO',
          colores: {
            create: { codigo: 'NG', nombre: 'Negro', hexadecimal: '#000000' },
          },
        },
        include: { colores: true },
      }),
      talla = await prisma.talla.findFirstOrThrow({ where: { valor: '40.5' } }),
      v = await prisma.variante.create({
        data: {
          productoId: p.id,
          productoColorId: p.colores[0].id,
          tallaId: talla.id,
          sku: 'REC-PROCPRUEBA-NG-40P5',
          existencias: 10,
        },
      }),
      foto = await prisma.archivoImagen.create({
        data: {
          productoOrigenId: p.id,
          proveedor: 'LEGADO',
          estado: 'DISPONIBLE',
          claveCarga: randomUUID(),
          solicitudHash: 'd'.repeat(64),
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
    const f = await recibida(cliente, (d) => {
        d.articulos[0].sku = v.sku;
      }),
      r = await procesar(f).expect(200),
      a = await prisma.pedidoArticulo.findFirstOrThrow({
        where: { pedido: { codigo: r.body.pedido.codigo as string } },
      });
    expect(a).toMatchObject({
      sku: v.sku,
      color: 'Negro',
      archivoImagenId: foto.id,
    });
    expect(a.talla.toString()).toBe('40.5');
    await prisma.imagenProducto.deleteMany({ where: { productoId: p.id } });
    expect((await recuperar(f).expect(200)).body).toEqual(r.body);
  });
  it('exige propiedad incluso con rol ADMIN y limita las peticiones', async () => {
    const f = await recibida();
    await procesar(f, otro).expect(404);
    await procesar(f, admin).expect(404);
    await request(app.getHttpServer())
      .get(base + '/' + f.id + '/operaciones/' + f.datos.claveSolicitud)
      .expect(401);
    limites.comprobar.mockImplementationOnce((_t, _q, res) => {
      res.setHeader('Retry-After', '60');
      throw new HttpException('Límite', 429);
    });
    const r = await procesar(f).expect(429);
    expect(r.headers['retry-after']).toBe('60');
    expect(r.headers['cache-control']).toBe('no-store');
  });
});
