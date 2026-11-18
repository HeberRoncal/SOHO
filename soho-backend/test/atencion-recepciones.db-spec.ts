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
import { AdministracionRecepcionesService } from '../src/pagos/recepciones/administracion-recepciones.service.js';
import { RespuestaAtencionRecepcion } from '../src/pagos/recepciones/respuesta-atencion-recepcion.js';
import { datosPedido } from './pedidos-fixtures.js';

const valor = process.env.TEST_ATENCION_DATABASE_URL;
if (!valor)
  throw Error(
    'Recepciones exige TEST_ATENCION_DATABASE_URL local, exclusiva y migrada.',
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
        rol: (await prisma.usuario.findUniqueOrThrow({ where: { id: c.id! } }))
          .rol,
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
async function cantidades() {
  return Promise.all([
    prisma.pedido.count(),
    prisma.pagoPedido.count(),
    prisma.reservaInventario.count(),
    prisma.comprobantePago.count(),
    prisma.movimientoInventario.count(),
  ]);
}
const administracion = '/api/admin/recepciones';
function adminPost(ruta: string, cuerpo: unknown, c = admin) {
  return c.agente
    .post(ruta)
    .set('Origin', origen)
    .set('X-CSRF-Token', c.csrf)
    .send(cuerpo as object);
}
function decision(
  f: Awaited<ReturnType<typeof recibida>>,
  opcion = 'registro',
) {
  return {
    claveSolicitud: randomUUID(),
    versionEsperada: f.datos.versionEsperada,
    comprobanteActualId: f.inicial.recepcion.comprobante.id as string,
    motivo: 'Motivo interno de prueba: revisar atención',
    confirmado: true,
    ...(opcion === 'registro'
      ? { aceptarCondicionesOriginales: true }
      : { mensaje: 'Adjunta una imagen legible de la misma transferencia.' }),
  };
}
async function atencion(c = cliente) {
  const f = await recibida(c);
  await prisma.producto.update({
    where: { id: productoId },
    data: { precio: '120.00' },
  });
  const r = await procesar(f, c).expect(200);
  expect(r.body.resultado).toBe('REQUIERE_ATENCION');
  f.datos.versionEsperada = r.body.recepcion.version as number;
  return f;
}
async function solicitar(f: Awaited<ReturnType<typeof recibida>>, c = admin) {
  const d = decision(f, 'correccion'),
    r = await adminPost(
      administracion + '/' + f.id + '/solicitud-correccion',
      d,
      c,
    ).expect(200);
  f.datos.versionEsperada = r.body.recepcion.version as number;
  return { d, r };
}
function adjuntar(
  f: Awaited<ReturnType<typeof recibida>>,
  d: unknown,
  c = cliente,
) {
  return c.agente
    .post(base + '/' + f.id + '/comprobantes')
    .set('Origin', origen)
    .set('X-CSRF-Token', c.csrf)
    .set('X-Pedido-Acceso', c.secreto ?? '')
    .send(d as object);
}
async function datosCorreccion(f: Awaited<ReturnType<typeof recibida>>) {
  const p = await datosPedido(sku);
  return {
    claveSolicitud: randomUUID(),
    versionEsperada: f.datos.versionEsperada,
    comprobante: { ...p.comprobante, nombreArchivo: 'correccion.png' },
  };
}
describe.sequential(
  'Atencion administrativa con HTTP, disco y MySQL temporal',
  () => {
    beforeAll(async () => {
      expect(await prisma.usuario.count()).toBe(0);
      expect(await prisma.recepcionCompra.count()).toBe(0);
      privado = await mkdtemp(path.join(tmpdir(), 'soho-atencion-test-'));
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
              req.path.startsWith('/api/admin/recepciones') &&
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
        expect(path.basename(real)).toMatch(/^soho-atencion-test-/);
        await rm(real, { recursive: true, force: true });
      }
    });

    it('protege bandeja, detalle y acciones con ADMIN, sesión, CSRF y cabeceras privadas', async () => {
      const f = await recibida(),
        d = decision(f, 'correccion');
      await request(app.getHttpServer()).get(administracion).expect(401);
      await cliente.agente.get(administracion).expect(403);
      await cliente.agente.get(administracion + '/' + f.id).expect(403);
      await adminPost(
        administracion + '/' + f.id + '/solicitud-correccion',
        d,
        cliente,
      ).expect(403);
      await admin.agente
        .post(administracion + '/' + f.id + '/solicitud-correccion')
        .set('Origin', origen)
        .send(d)
        .expect(403);
      const r = await admin.agente.get(administracion).expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
    });
    it('ofrece paginación, búsquedas y conteos globales sin modificar datos comerciales', async () => {
      const f = await recibida(),
        antes = await negocio(),
        r = await admin.agente.get(administracion + '?limite=1').expect(200);
      expect(r.body.recepciones).toHaveLength(1);
      expect(r.body.paginacion.total).toBeGreaterThan(1);
      expect(r.body.resumen.RECIBIDA).toBeGreaterThan(0);
      const referencia = f.inicial.recepcion.referencia as string;
      expect(
        (
          await admin.agente
            .get(administracion + '?busqueda=' + referencia)
            .expect(200)
        ).body.paginacion.total,
      ).toBe(1);
      expect(
        (await admin.agente.get(administracion + '?busqueda=%25').expect(200))
          .body.paginacion.total,
      ).toBe(0);
      expect(
        (
          await admin.agente
            .get(administracion + '?busqueda=' + cliente.correo)
            .expect(200)
        ).body.paginacion.total,
      ).toBeGreaterThan(0);
      const filtrado = await admin.agente
        .get(administracion + '?estado=PEDIDO_CREADO')
        .expect(200);
      expect(filtrado.body.resumen.RECIBIDA).toBe(r.body.resumen.RECIBIDA);
      expect(await negocio()).toEqual(antes);
    });
    it.each([
      'pagina=0',
      'pagina=1.5',
      'limite=51',
      'estado=FALSO',
      'extra=1',
      'busqueda=a&busqueda=b',
    ])('rechaza filtros %s', async (q) => {
      await admin.agente.get(administracion + '?' + q).expect(400);
    });
    it('diagnostica precio vigente y condiciones originales y muestra historial y archivo privado', async () => {
      const f = await atencion(),
        r = await admin.agente.get(administracion + '/' + f.id).expect(200);
      expect(r.body.diagnostico.actual).toEqual({
        apto: false,
        motivos: ['PRECIO_CAMBIADO'],
      });
      expect(r.body.diagnostico.condicionesOriginales.apto).toBe(true);
      expect(r.body.capacidades.registrarPedido).toBe(true);
      expect(r.body.historial[0].accion).toBe('PROCESAR');
      const foto = await admin.agente
        .get(
          administracion +
            '/' +
            f.id +
            '/comprobantes/' +
            f.inicial.recepcion.comprobante.id,
        )
        .expect(200);
      expect(foto.headers['content-type']).toContain('image/png');
      await admin.agente
        .get(administracion + '/' + f.id + '/comprobantes/' + randomUUID())
        .expect(404);
      for (const privado of [
        'archivoClave',
        'solicitudHash',
        'tokenProceso',
        'accesoInvitadoHash',
      ])
        expect(JSON.stringify(r.body)).not.toContain(privado);
    });
    it('registra precio original en líneas y unidades sin atribuir la compra al ADMIN', async () => {
      const f = await atencion(),
        d = decision(f),
        n = await cantidades(),
        r = await adminPost(
          administracion + '/' + f.id + '/registro-pedido',
          d,
        ).expect(200);
      expect(r.body.resultado).toBe('PEDIDO_CREADO');
      expect((await cantidades()).map((x, i) => x - n[i])).toEqual([
        1, 1, 1, 1, 0,
      ]);
      const p = await prisma.pedido.findUniqueOrThrow({
        where: { codigo: r.body.pedido.codigo as string },
        include: {
          articulos: { include: { unidades: true } },
          eventos: true,
          pago: true,
        },
      });
      expect(p.usuarioId).toBe(cliente.id);
      expect(p.total.toFixed(2)).toBe('199.98');
      expect(p.pago!.estado).toBe('PENDIENTE');
      expect(p.articulos[0].precioUnitario.toFixed(2)).toBe('99.99');
      expect(
        p.articulos[0].unidades.every(
          (u) => u.importeNeto.toFixed(2) === '99.99',
        ),
      ).toBe(true);
      expect(
        p.eventos.every(
          (e) => e.actor === 'ADMIN' && e.responsableId === admin.id,
        ),
      ).toBe(true);
      const o = await prisma.operacionRecepcionCompra.findUniqueOrThrow({
        where: { claveSolicitud: d.claveSolicitud },
      });
      expect(o).toMatchObject({
        accion: 'REGISTRAR_PEDIDO',
        responsableId: admin.id,
        motivo: d.motivo,
        estado: 'CONFIRMADA',
      });
      const a = await admin.agente
        .get(administracion + '/' + f.id + '/operaciones/' + d.claveSolicitud)
        .expect(200);
      expect(a.body).toEqual(r.body);
      expect(
        (
          await adminPost(
            administracion + '/' + f.id + '/registro-pedido',
            d,
          ).expect(200)
        ).body,
      ).toEqual(r.body);
      expect(
        (
          await procesar(f, cliente, {
            ...f.datos,
            claveSolicitud: randomUUID(),
          }).expect(200)
        ).body.resultado,
      ).toBe('PEDIDO_CREADO');
      await get(base + '/' + f.id + '/operaciones/' + d.claveSolicitud).expect(
        404,
      );
    });
    it('registra una compra invitada conservando hash y plazo propios del pedido', async () => {
      const c = await cuenta(),
        f = await atencion(c),
        d = decision(f),
        r = await adminPost(
          administracion + '/' + f.id + '/registro-pedido',
          d,
        ).expect(200),
        p = await prisma.pedido.findUniqueOrThrow({
          where: { codigo: r.body.pedido.codigo as string },
        });
      expect(p.usuarioId).toBeNull();
      expect(p.accesoInvitadoHash).toBe(
        createHash('sha256').update(c.secreto!).digest('hex'),
      );
      await get('/api/pedidos/' + p.codigo, c).expect(200);
      await get('/api/pedidos/' + p.codigo, cliente).expect(404);
    });
    it.each([
      'stock',
      'variante',
      'producto',
      'marca',
      'categoria',
      'cobertura',
    ])('condiciones originales no omiten disponibilidad: %s', async (caso) => {
      const f = await atencion(),
        d = decision(f),
        v = await prisma.variante.findUniqueOrThrow({ where: { sku } }),
        p = await prisma.producto.findUniqueOrThrow({
          where: { id: productoId },
        }),
        z = await prisma.zonaEntrega.findUniqueOrThrow({
          where: { codigo: 'la-esperanza' },
        });
      try {
        if (caso === 'stock')
          await prisma.variante.update({
            where: { id: v.id },
            data: { existencias: v.cantidadReservada + 1 },
          });
        if (caso === 'variante')
          await prisma.variante.update({
            where: { id: v.id },
            data: { habilitada: false },
          });
        if (caso === 'producto')
          await prisma.producto.update({
            where: { id: p.id },
            data: { estado: 'ARCHIVADO' },
          });
        if (caso === 'marca')
          await prisma.marca.update({
            where: { id: p.marcaId! },
            data: { activa: false },
          });
        if (caso === 'categoria')
          await prisma.categoria.update({
            where: { id: p.categoriaId! },
            data: { activa: false },
          });
        if (caso === 'cobertura')
          await prisma.zonaEntrega.update({
            where: { id: z.id },
            data: { habilitada: false },
          });
        if (caso === 'tarifa')
          await prisma.zonaEntrega.update({
            where: { id: z.id },
            data: { tarifa: null },
          });
        const n = await cantidades(),
          r = await adminPost(
            administracion + '/' + f.id + '/registro-pedido',
            d,
          ).expect(200);
        expect(r.body.resultado).toBe('REQUIERE_ATENCION');
        expect(await cantidades()).toEqual(n);
      } finally {
        await prisma.marca.update({
          where: { id: p.marcaId! },
          data: { activa: true },
        });
        await prisma.categoria.update({
          where: { id: p.categoriaId! },
          data: { activa: true },
        });
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { habilitada: z.habilitada, tarifa: z.tarifa },
        });
      }
    });
    it('conserva tarifa y plazo originales al aceptar expresamente una cobertura nuevamente cotizable', async () => {
      const z = await prisma.zonaEntrega.findUniqueOrThrow({
        where: { codigo: 'trujillo' },
      });
      try {
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { habilitada: true, tarifa: '6.00', plazo: 'Original' },
        });
        const f = await recibida(cliente, (p) => {
          p.entrega.distrito = 'trujillo';
          p.cotizacion = {
            costoEnvio: '6.00',
            plazoEntrega: 'Original',
            total: '205.98',
          };
        });
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { tarifa: '9.00', plazo: 'Actual' },
        });
        const a = await procesar(f).expect(200);
        f.datos.versionEsperada = a.body.recepcion.version as number;
        const r = await adminPost(
            administracion + '/' + f.id + '/registro-pedido',
            decision(f),
          ).expect(200),
          p = await prisma.pedido.findUniqueOrThrow({
            where: { codigo: r.body.pedido.codigo as string },
          });
        expect(p.costoEnvio.toFixed(2)).toBe('6.00');
        expect(p.plazoEntrega).toBe('Original');
        expect(p.total.toFixed(2)).toBe('205.98');
      } finally {
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { habilitada: z.habilitada, tarifa: z.tarifa, plazo: z.plazo },
        });
      }
    });
    it('solicita corrección sin exponer motivo interno al comprador y conserva la respuesta histórica', async () => {
      const f = await recibida(),
        n = await cantidades(),
        s = await solicitar(f),
        o = await prisma.operacionRecepcionCompra.findUniqueOrThrow({
          where: { claveSolicitud: s.d.claveSolicitud },
        });
      expect(o.motivo).toBe(s.d.motivo);
      expect(o.mensaje).toBe(
        'Adjunta una imagen legible de la misma transferencia.',
      );
      expect(await cantidades()).toEqual(n);
      const r = await get(base + '/' + f.id).expect(200);
      expect(r.body.correccion).toMatchObject({
        mensaje: o.mensaje,
        pendiente: true,
        versionEsperada: 3,
      });
      expect(JSON.stringify(r.body)).not.toContain(s.d.motivo);
      expect(
        (
          await adminPost(
            administracion + '/' + f.id + '/solicitud-correccion',
            s.d,
          ).expect(200)
        ).body,
      ).toEqual(s.r.body);
      await adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        decision(f),
      ).expect(409);
      await procesar(f).expect(409);
      await adminPost(
        administracion + '/' + f.id + '/solicitud-correccion',
        decision(f, 'correccion'),
      ).expect(409);
    });
    it('adjunta versión nueva, conserva la primera, no crea pedido y permite procesamiento posterior', async () => {
      const f = await recibida(),
        s = await solicitar(f),
        d = await datosCorreccion(f),
        n = await cantidades(),
        antes = await prisma.comprobanteRecepcionCompra.findFirstOrThrow({
          where: { recepcionId: f.id },
        }),
        r = await adjuntar(f, d).expect(201);
      expect(r.body.resultado).toBe('ADJUNTAR_COMPROBANTE');
      expect(r.body.recepcion).toMatchObject({
        estado: 'RECIBIDA',
        version: 4,
        comprobante: { version: 2, nombreArchivo: 'correccion.png' },
      });
      expect(await cantidades()).toEqual(n);
      expect(
        await prisma.comprobanteRecepcionCompra.count({
          where: { recepcionId: f.id },
        }),
      ).toBe(2);
      expect(
        await readFile(path.join(privado, antes.archivoClave)),
      ).toHaveLength(antes.tamanoBytes);
      expect((await adjuntar(f, d).expect(200)).body).toEqual(r.body);
      expect(
        (
          await get(
            base + '/' + f.id + '/operaciones/' + d.claveSolicitud,
          ).expect(200)
        ).body,
      ).toEqual(r.body);
      expect(
        (
          await admin.agente
            .get(
              administracion +
                '/' +
                f.id +
                '/operaciones/' +
                s.d.claveSolicitud,
            )
            .expect(200)
        ).body,
      ).toEqual(s.r.body);
      await get(base + '/' + f.id + '/comprobantes/' + antes.id).expect(200);
      await get(
        base + '/' + f.id + '/comprobantes/' + r.body.recepcion.comprobante.id,
      ).expect(200);
      expect((await post(f.d).expect(200)).body).toEqual(f.inicial);
      const procesada = await procesar(f, cliente, {
        claveSolicitud: randomUUID(),
        versionEsperada: 4,
      }).expect(200);
      expect(procesada.body.resultado).toBe('PEDIDO_CREADO');
      const pc = await prisma.comprobantePago.findFirstOrThrow({
        where: {
          pago: { pedido: { codigo: procesada.body.pedido.codigo as string } },
        },
      });
      expect(pc.comprobanteRecepcionId).toBe(r.body.recepcion.comprobante.id);
    });
    it('una corrección en atención conserva el impedimento comercial hasta que ADMIN decida', async () => {
      const f = await atencion();
      const original = await recuperar(f).expect(200);
      await solicitar(f);
      const d = await datosCorreccion(f),
        r = await adjuntar(f, d).expect(201);
      expect(r.body.recepcion.estado).toBe('REQUIERE_ATENCION');
      expect(r.body.recepcion.motivos).toEqual(['PRECIO_CAMBIADO']);
      expect((await recuperar(f).expect(200)).body).toEqual(original.body);
      await procesar(f, cliente, {
        claveSolicitud: randomUUID(),
        versionEsperada: r.body.recepcion.version,
      }).expect(409);
      f.datos.versionEsperada = r.body.recepcion.version as number;
      const registro = {
        ...decision(f),
        comprobanteActualId: r.body.recepcion.comprobante.id,
      };
      await adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        registro,
      ).expect(200);
    });
    it('no permite corregir sin solicitud, otra cuenta, versión vieja o imagen distinta bajo la misma clave', async () => {
      const f = await recibida(),
        d = await datosCorreccion(f);
      await adjuntar(f, d).expect(409);
      await solicitar(f);
      await adjuntar(f, d).expect(409);
      d.versionEsperada = f.datos.versionEsperada;
      await adjuntar(f, d, otro).expect(404);
      await adjuntar(f, d, admin).expect(404);
      const r = await adjuntar(f, d).expect(201);
      await adjuntar(f, {
        ...d,
        comprobante: { ...d.comprobante, numeroOperacion: '999' },
      }).expect(409);
      await adjuntar(f, {
        ...d,
        claveSolicitud: randomUUID(),
        versionEsperada: r.body.recepcion.version,
      }).expect(409);
    });
    it.each([
      'confirmado',
      'aceptarCondicionesOriginales',
      'motivo',
      'versionEsperada',
      'comprobanteActualId',
      'extra',
    ])('rechaza registro inválido en %s sin escrituras', async (campo) => {
      const f = await atencion(),
        d: Record<string, unknown> = decision(f),
        n = await cantidades();
      if (campo === 'extra') d.total = '1.00';
      else if (campo === 'versionEsperada') d[campo] = '3';
      else if (campo === 'comprobanteActualId') d[campo] = 'invalido';
      else delete d[campo];
      await adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        d,
      ).expect(400);
      expect(await cantidades()).toEqual(n);
    });
    it.each([
      'la-esperanza',
      'trujillo',
      'el-porvenir',
      'florencia-de-mora',
      'victor-larco',
      'huanchaco',
      'moche',
    ])(
      'registro administrativo conserva distrito %s y su cotización original',
      async (distrito) => {
        const z = await prisma.zonaEntrega.findUniqueOrThrow({
            where: { codigo: distrito },
          }),
          tarifa = distrito === 'la-esperanza' ? '0.00' : '6.00';
        try {
          await prisma.zonaEntrega.update({
            where: { id: z.id },
            data: { habilitada: true, tarifa, plazo: null },
          });
          const f = await recibida(cliente, (p) => {
            p.entrega.distrito = distrito;
            p.cotizacion = {
              costoEnvio: tarifa,
              plazoEntrega: null,
              total: tarifa === '0.00' ? '199.98' : '205.98',
            };
          });
          await prisma.producto.update({
            where: { id: productoId },
            data: { precio: '120.00' },
          });
          const a = await procesar(f).expect(200);
          f.datos.versionEsperada = a.body.recepcion.version as number;
          const r = await adminPost(
              administracion + '/' + f.id + '/registro-pedido',
              decision(f),
            ).expect(200),
            p = await prisma.pedido.findUniqueOrThrow({
              where: { codigo: r.body.pedido.codigo as string },
            });
          expect(p.distritoCodigo).toBe(distrito);
          expect(p.costoEnvio.toFixed(2)).toBe(tarifa);
        } finally {
          await prisma.zonaEntrega.update({
            where: { id: z.id },
            data: {
              habilitada: z.habilitada,
              tarifa: z.tarifa,
              plazo: z.plazo,
            },
          });
        }
      },
    );
    it('la tarifa pendiente de Trujillo sigue impidiendo registro administrativo', async () => {
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
          p.cotizacion = {
            costoEnvio: '6.00',
            plazoEntrega: null,
            total: '205.98',
          };
        });
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { tarifa: null },
        });
        const a = await procesar(f).expect(200);
        f.datos.versionEsperada = a.body.recepcion.version as number;
        const n = await cantidades(),
          r = await adminPost(
            administracion + '/' + f.id + '/registro-pedido',
            decision(f),
          ).expect(200);
        expect(r.body.resultado).toBe('REQUIERE_ATENCION');
        expect(r.body.recepcion.motivos).toEqual([
          'COBERTURA_TARIFA_PENDIENTE',
        ]);
        expect(await cantidades()).toEqual(n);
      } finally {
        await prisma.zonaEntrega.update({
          where: { id: z.id },
          data: { habilitada: z.habilitada, tarifa: z.tarifa, plazo: z.plazo },
        });
      }
    });
    it('dos registros con la misma clave y una solicitud concurrente no duplican ni mezclan decisiones', async () => {
      const f = await atencion(),
        d = decision(f),
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
      const primera = adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        d,
      ).then((r) => r);
      await entrada.promesa;
      try {
        await adminPost(
          administracion + '/' + f.id + '/registro-pedido',
          d,
        ).expect(202);
        await adminPost(administracion + '/' + f.id + '/registro-pedido', {
          ...d,
          claveSolicitud: randomUUID(),
        }).expect(409);
        await adminPost(
          administracion + '/' + f.id + '/solicitud-correccion',
          decision(f, 'correccion'),
        ).expect(409);
        expect(await cantidades()).toEqual(n);
      } finally {
        salida.abrir();
      }
      const r = await primera;
      expect(r.status).toBe(200);
      expect(r.body.resultado).toBe('PEDIDO_CREADO');
      expect((await cantidades()).map((x, i) => x - n[i])).toEqual([
        1, 1, 1, 1, 0,
      ]);
    });
    it('un rollback después de reservar unidades conserva la operación y permite recuperar el registro propio', async () => {
      const f = await atencion(),
        d = decision(f),
        s = app.get(RegistroPedidoService),
        datos = s.datos.bind(s),
        n = await cantidades(),
        v = await prisma.variante.findUniqueOrThrow({ where: { sku } });
      vi.spyOn(s, 'datos').mockImplementationOnce(async (...args) => {
        await datos(...args);
        throw new Error('Fallo sintético de registro');
      });
      await adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        d,
      ).expect(503);
      expect(await cantidades()).toEqual(n);
      expect(
        (await prisma.variante.findUniqueOrThrow({ where: { sku } }))
          .cantidadReservada,
      ).toBe(v.cantidadReservada);
      const o = await prisma.operacionRecepcionCompra.findUniqueOrThrow({
        where: { claveSolicitud: d.claveSolicitud },
      });
      expect(o.estado).toBe('PENDIENTE');
      await prisma.operacionRecepcionCompra.update({
        where: { id: o.id },
        data: { proximaRevisionEn: new Date() },
      });
      const r = await admin.agente
        .get(administracion + '/' + f.id + '/operaciones/' + d.claveSolicitud)
        .expect(200);
      expect(r.body.resultado).toBe('PEDIDO_CREADO');
    });
    it('recupera una respuesta HTTP perdida del registro administrativo sin otra reserva', async () => {
      const f = await atencion(),
        d = decision(f);
      perder = d.claveSolicitud;
      await expect(
        adminPost(administracion + '/' + f.id + '/registro-pedido', d),
      ).rejects.toThrow();
      const n = await cantidades(),
        r = await admin.agente
          .get(administracion + '/' + f.id + '/operaciones/' + d.claveSolicitud)
          .expect(200);
      expect(r.body.resultado).toBe('PEDIDO_CREADO');
      expect(
        (
          await adminPost(
            administracion + '/' + f.id + '/registro-pedido',
            d,
          ).expect(200)
        ).body,
      ).toEqual(r.body);
      expect(await cantidades()).toEqual(n);
    });
    it('recupera el COMMIT de solicitud de corrección aunque falle el retorno de la transacción', async () => {
      const f = await recibida(),
        d = decision(f, 'correccion'),
        s = app.get(EscrituraAutorizadaService),
        original = s.transaccion.bind(s);
      vi.spyOn(s, 'transaccion').mockImplementationOnce(async (op) => {
        await original(op);
        throw new Error('COMMIT sin retorno');
      });
      const r = await adminPost(
        administracion + '/' + f.id + '/solicitud-correccion',
        d,
      ).expect(200);
      expect(r.body.resultado).toBe('SOLICITAR_CORRECCION');
      expect(
        await prisma.operacionRecepcionCompra.count({
          where: { claveSolicitud: d.claveSolicitud },
        }),
      ).toBe(1);
      expect(
        (
          await admin.agente
            .get(
              administracion + '/' + f.id + '/operaciones/' + d.claveSolicitud,
            )
            .expect(200)
        ).body,
      ).toEqual(r.body);
    });
    it('versiones y responsable se comprueban después de la copia; un ADMIN degradado no registra', async () => {
      const c = await cuenta('ADMIN'),
        f = await atencion(),
        d = decision(f),
        s = app.get(ComprobantesPrivadosService),
        copiar = s.copiarReservado.bind(s),
        n = await cantidades();
      vi.spyOn(s, 'copiarReservado').mockImplementationOnce(async (...args) => {
        await copiar(...args);
        await prisma.usuario.update({
          where: { id: c.id! },
          data: { rol: 'CLIENTE' },
        });
      });
      await adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        d,
        c,
      ).expect(401);
      expect(await cantidades()).toEqual(n);
      expect(
        (
          await prisma.operacionRecepcionCompra.findUniqueOrThrow({
            where: { claveSolicitud: d.claveSolicitud },
          })
        ).estado,
      ).toBe('PENDIENTE');
    });
    it('revalida el permiso ADMIN después de leer una imagen privada', async () => {
      const c = await cuenta('ADMIN'),
        f = await recibida(),
        s = app.get(ComprobantesPrivadosService),
        leer = s.leer.bind(s);
      vi.spyOn(s, 'leer').mockImplementationOnce(async (...args) => {
        const b = await leer(...args);
        await prisma.sesion.updateMany({
          where: { usuarioId: c.id },
          data: { revocadaEn: new Date() },
        });
        return b;
      });
      await c.agente
        .get(
          administracion +
            '/' +
            f.id +
            '/comprobantes/' +
            f.inicial.recepcion.comprobante.id,
        )
        .expect(401);
    });
    it('una sesión revocada no puede tomar una decisión mediante el servicio', async () => {
      const c = await cuenta('ADMIN'),
        f = await recibida(),
        context = await contexto(c),
        n = await prisma.operacionRecepcionCompra.count();
      await prisma.sesion.updateMany({
        where: { usuarioId: c.id },
        data: { revocadaEn: new Date() },
      });
      await expect(
        app
          .get(AdministracionRecepcionesService)
          .solicitar(f.id, decision(f, 'correccion'), context.sesion),
      ).rejects.toThrow('La sesión ya no autoriza');
      expect(await prisma.operacionRecepcionCompra.count()).toBe(n);
    });
    it('corrección pendiente reserva identidad, bloquea otras decisiones y se recupera por su misma clave', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f),
        s = app.get(ComprobantesPrivadosService),
        n = await cantidades();
      vi.spyOn(s, 'guardarReservado').mockRejectedValueOnce(
        new ServiceUnavailableException('Fallo sintético de disco'),
      );
      const r = await adjuntar(f, d).expect(202);
      expect(r.body.operacion.estado).toBe('PENDIENTE');
      expect(await cantidades()).toEqual(n);
      await adjuntar(f, { ...d, claveSolicitud: randomUUID() }).expect(409);
      await adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        decision(f),
      ).expect(409);
      const final = await adjuntar(f, d).expect(200);
      expect(final.body.recepcion.comprobante.version).toBe(2);
      expect(
        await prisma.comprobanteRecepcionCompra.count({
          where: { recepcionId: f.id },
        }),
      ).toBe(2);
    });
    it('GET confirma una corrección ya escrita sin reenviar bytes ni recodificar', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f),
        s = app.get(ComprobantesPrivadosService),
        guardar = s.guardarReservado.bind(s);
      vi.spyOn(s, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          await guardar(...args);
          throw new Error('Caída después de escribir');
        },
      );
      await adjuntar(f, d).expect(202);
      const o = await prisma.operacionRecepcionCompra.findUniqueOrThrow({
        where: { claveSolicitud: d.claveSolicitud },
      });
      await prisma.comprobanteRecepcionCompra.update({
        where: { id: o.comprobanteId },
        data: { proximaRevisionEn: new Date() },
      });
      const a = await readdir(path.join(privado, 'comprobantes')),
        preparar = vi.spyOn(s, 'preparar'),
        r = await get(
          base + '/' + f.id + '/operaciones/' + d.claveSolicitud,
        ).expect(200);
      expect(r.body.resultado).toBe('ADJUNTAR_COMPROBANTE');
      expect(preparar).not.toHaveBeenCalled();
      expect(await readdir(path.join(privado, 'comprobantes'))).toEqual(a);
    });
    it('el rollback de confirmación de corrección conserva las dos imágenes y la respuesta inicial', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f),
        n = await cantidades();
      vi.spyOn(RespuestaAtencionRecepcion, 'crear').mockImplementationOnce(
        () => {
          throw new Error('Fallo sintético antes del COMMIT');
        },
      );
      await adjuntar(f, d).expect(202);
      expect(await cantidades()).toEqual(n);
      const r = await prisma.recepcionCompra.findUniqueOrThrow({
        where: { id: f.id },
      });
      expect(r.comprobanteActualId).toBe(f.inicial.recepcion.comprobante.id);
      expect(r.respuesta).toEqual(f.inicial);
      const final = await adjuntar(f, d).expect(200);
      expect(final.body.recepcion.comprobante.version).toBe(2);
    });
    it('la misma clave de corrección concurrente publica una sola versión de imagen', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f),
        s = app.get(ComprobantesPrivadosService),
        guardar = s.guardarReservado.bind(s),
        entrada = puerta(),
        salida = puerta();
      vi.spyOn(s, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          entrada.abrir();
          await salida.promesa;
          await guardar(...args);
        },
      );
      const primero = adjuntar(f, d).then((r) => r);
      await entrada.promesa;
      try {
        await adjuntar(f, d).expect(202);
        await get(
          base + '/' + f.id + '/operaciones/' + d.claveSolicitud,
        ).expect(202);
      } finally {
        salida.abrir();
      }
      expect((await primero).status).toBe(201);
      expect(
        await prisma.comprobanteRecepcionCompra.count({
          where: { recepcionId: f.id },
        }),
      ).toBe(2);
      expect(
        (await readdir(path.join(privado, 'comprobantes'))).filter((x) =>
          x.endsWith('.tmp'),
        ),
      ).toEqual([]);
    });
    it('una corrección no cambia el número de operación ni el destino original', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f);
      await adjuntar(f, {
        ...d,
        comprobante: { ...d.comprobante, numeroOperacion: '999999' },
      }).expect(409);
      const r = await adjuntar(f, d).expect(201);
      expect(r.body.recepcion.instruccion.destino).toEqual(
        f.inicial.recepcion.instruccion.destino,
      );
      expect(r.body.recepcion.comprobante.numeroOperacion).toBe('001234');
    });
    it('una fuente antigua alterada falla al servirla pero no se sustituye por la nueva versión', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f);
      await adjuntar(f, d).expect(201);
      const c = await prisma.comprobanteRecepcionCompra.findFirstOrThrow({
          where: { recepcionId: f.id, version: 1 },
        }),
        ruta = path.join(privado, c.archivoClave),
        bytes = await readFile(ruta);
      await writeFile(ruta, 'alterado');
      await admin.agente
        .get(administracion + '/' + f.id + '/comprobantes/' + c.id)
        .expect(503);
      await unlink(ruta);
      await get(base + '/' + f.id + '/comprobantes/' + c.id).expect(503);
      await writeFile(ruta, bytes);
    });
    it('no conserva una decisión ni un diagnóstico inventado cuando falla la base', async () => {
      const f = await atencion(),
        n = await cantidades();
      vi.spyOn(
        app.get(PreparacionPedidoService),
        'verificar',
      ).mockRejectedValueOnce(new Error('Fallo sintético de consulta'));
      await admin.agente.get(administracion + '/' + f.id).expect(503);
      expect(await cantidades()).toEqual(n);
      const d = decision(f);
      vi.spyOn(RespuestaProcesamientoRecepcion, 'crear').mockImplementationOnce(
        () => {
          throw new Error('Fallo sintético de resultado');
        },
      );
      const c = await contexto(admin);
      await expect(
        app
          .get(ProcesamientoRecepcionService)
          .registrarAdmin(f.id, d, c.sesion),
      ).rejects.toThrow('Conserva la recepción');
      expect(await cantidades()).toEqual(n);
    });
    it('limita escritura y lectura sin cambiar recepciones', async () => {
      const f = await recibida(),
        n = await cantidades();
      limites.comprobar.mockImplementationOnce((_t, _r, res) => {
        res.setHeader('Retry-After', '60');
        throw new HttpException('Límite', 429);
      });
      const r = await adminPost(
        administracion + '/' + f.id + '/solicitud-correccion',
        decision(f, 'correccion'),
      ).expect(429);
      expect(r.headers['retry-after']).toBe('60');
      expect(await cantidades()).toEqual(n);
    });
    it('la corrección invitada conserva la credencial y las versiones de su misma compra', async () => {
      const c = await cuenta(),
        f = await recibida(c);
      await solicitar(f);
      const d = await datosCorreccion(f),
        r = await adjuntar(f, d, c).expect(201);
      expect(r.body.recepcion.estado).toBe('RECIBIDA');
      expect(
        (
          await get(
            base + '/' + f.id + '/operaciones/' + d.claveSolicitud,
            c,
          ).expect(200)
        ).body,
      ).toEqual(r.body);
      await get(
        base + '/' + f.id + '/operaciones/' + d.claveSolicitud,
        cliente,
      ).expect(404);
      await get(
        base + '/' + f.id + '/comprobantes/' + r.body.recepcion.comprobante.id,
        await cuenta(),
      ).expect(404);
    });
    it('la ruta de corrección acepta JSON grande y sanea la imagen, manteniendo la transferencia', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f);
      d.comprobante.contenidoBase64 = Buffer.concat([
        Buffer.from(d.comprobante.contenidoBase64, 'base64'),
        Buffer.alloc(20 * 1024, 65),
      ]).toString('base64');
      const r = await adjuntar(f, d).expect(201);
      expect(r.body.recepcion.comprobante.tamanoBytes).toBeLessThan(20 * 1024);
      expect(r.body.recepcion.comprobante.numeroOperacion).toBe('001234');
    });
    it.each(['mime', 'imagen', 'ruta', 'propietario', 'version'])(
      'corrección inválida (%s) no reserva otra versión',
      async (caso) => {
        const f = await recibida();
        await solicitar(f);
        const d: Record<string, any> = await datosCorreccion(f),
          n = await prisma.comprobanteRecepcionCompra.count();
        if (caso === 'mime') d.comprobante.tipoArchivo = 'text/html';
        if (caso === 'imagen')
          d.comprobante.contenidoBase64 =
            Buffer.from('imagen falsa').toString('base64');
        if (caso === 'ruta') d.comprobante.nombreArchivo = '../archivo.png';
        if (caso === 'propietario') d.usuarioId = admin.id;
        if (caso === 'version') d.versionEsperada = 0;
        await adjuntar(f, d).expect(400);
        expect(await prisma.comprobanteRecepcionCompra.count()).toBe(n);
      },
    );
    it('un segundo ciclo de corrección conserva respuestas históricas y solo actualiza la versión actual', async () => {
      const f = await recibida(),
        primera = await solicitar(f),
        d1 = await datosCorreccion(f),
        r1 = await adjuntar(f, d1).expect(201);
      f.datos.versionEsperada = r1.body.recepcion.version as number;
      const solicitud2 = {
        ...decision(f, 'correccion'),
        comprobanteActualId: r1.body.recepcion.comprobante.id,
      };
      const pedida = await adminPost(
        administracion + '/' + f.id + '/solicitud-correccion',
        solicitud2,
      ).expect(200);
      f.datos.versionEsperada = pedida.body.recepcion.version as number;
      const d2 = await datosCorreccion(f),
        r2 = await adjuntar(f, d2).expect(201);
      expect(r2.body.recepcion.comprobante.version).toBe(3);
      expect((await adjuntar(f, d1).expect(200)).body).toEqual(r1.body);
      expect(
        (
          await adminPost(
            administracion + '/' + f.id + '/solicitud-correccion',
            primera.d,
          ).expect(200)
        ).body,
      ).toEqual(primera.r.body);
      expect(
        await prisma.comprobanteRecepcionCompra.count({
          where: { recepcionId: f.id },
        }),
      ).toBe(3);
    });
    it('dos solicitudes simultáneas de administradores producen una sola corrección abierta', async () => {
      const segundo = await cuenta('ADMIN'),
        f = await recibida(),
        a = decision(f, 'correccion'),
        b = decision(f, 'correccion'),
        n = await cantidades();
      const r = await Promise.all([
        adminPost(administracion + '/' + f.id + '/solicitud-correccion', a),
        adminPost(
          administracion + '/' + f.id + '/solicitud-correccion',
          b,
          segundo,
        ),
      ]);
      expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect(await cantidades()).toEqual(n);
      expect(
        await prisma.operacionRecepcionCompra.count({
          where: { recepcionId: f.id, accion: 'SOLICITAR_CORRECCION' },
        }),
      ).toBe(1);
    });
    it('el COMMIT final de corrección puede recuperarse sin volver a adjuntar la imagen', async () => {
      const f = await recibida();
      await solicitar(f);
      const d = await datosCorreccion(f),
        a = app.get(ComprobantesPrivadosService),
        guardar = a.guardarReservado.bind(a),
        s = app.get(EscrituraAutorizadaService),
        tx = s.transaccion.bind(s);
      vi.spyOn(a, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          await guardar(...args);
          vi.spyOn(s, 'transaccion').mockImplementationOnce(async (op) => {
            await tx(op);
            throw new Error('COMMIT sin retorno');
          });
        },
      );
      const r = await adjuntar(f, d).expect(200);
      expect(r.body.resultado).toBe('ADJUNTAR_COMPROBANTE');
      expect(
        (
          await get(
            base + '/' + f.id + '/operaciones/' + d.claveSolicitud,
          ).expect(200)
        ).body,
      ).toEqual(r.body);
      expect(
        await prisma.comprobanteRecepcionCompra.count({
          where: { recepcionId: f.id },
        }),
      ).toBe(2);
    });
    it('una sesión revocada tras escribir corrección conserva bytes y deja la confirmación pendiente', async () => {
      const c = await cuenta('CLIENTE'),
        f = await recibida(c);
      await solicitar(f);
      const d = await datosCorreccion(f),
        s = app.get(ComprobantesPrivadosService),
        guardar = s.guardarReservado.bind(s),
        n = await cantidades();
      vi.spyOn(s, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          await guardar(...args);
          await prisma.sesion.updateMany({
            where: { usuarioId: c.id },
            data: { revocadaEn: new Date() },
          });
        },
      );
      await adjuntar(f, d, c).expect(401);
      expect(await cantidades()).toEqual(n);
      const o = await prisma.operacionRecepcionCompra.findUniqueOrThrow({
          where: { claveSolicitud: d.claveSolicitud },
        }),
        imagen = await prisma.comprobanteRecepcionCompra.findUniqueOrThrow({
          where: { id: o.comprobanteId },
        });
      expect(o.estado).toBe('PENDIENTE');
      expect(imagen.estadoArchivo).toBe('PENDIENTE');
      expect(
        await readFile(path.join(privado, imagen.archivoClave)),
      ).toHaveLength(imagen.tamanoBytes);
    });
    it('los snapshots finales incompatibles no se entregan como decisiones válidas', async () => {
      const f = await recibida(),
        s = await solicitar(f),
        o = await prisma.operacionRecepcionCompra.findUniqueOrThrow({
          where: { claveSolicitud: s.d.claveSolicitud },
        });
      await prisma.operacionRecepcionCompra.update({
        where: { id: o.id },
        data: { respuesta: { secreto: 'no exponer' } },
      });
      const r = await admin.agente
        .get(administracion + '/' + f.id + '/operaciones/' + s.d.claveSolicitud)
        .expect(503);
      expect(JSON.stringify(r.body)).not.toContain('no exponer');
    });
    it('otra cuenta ADMIN consulta el caso pero no recupera la operación privada del responsable', async () => {
      const segundo = await cuenta('ADMIN'),
        f = await atencion(),
        d = decision(f),
        r = await adminPost(
          administracion + '/' + f.id + '/registro-pedido',
          d,
        ).expect(200);
      await segundo.agente.get(administracion + '/' + f.id).expect(200);
      await segundo.agente
        .get(administracion + '/' + f.id + '/operaciones/' + d.claveSolicitud)
        .expect(404);
      await adminPost(
        administracion + '/' + f.id + '/registro-pedido',
        d,
        segundo,
      ).expect(409);
      expect(
        (
          await admin.agente
            .get(
              administracion + '/' + f.id + '/operaciones/' + d.claveSolicitud,
            )
            .expect(200)
        ).body,
      ).toEqual(r.body);
    });
  },
);
