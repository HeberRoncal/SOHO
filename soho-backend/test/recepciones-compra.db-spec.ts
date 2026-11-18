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
import { RecepcionesCompraService } from '../src/pagos/recepciones/recepciones-compra.service.js';
import { datosPedido } from './pedidos-fixtures.js';

const valor = process.env.TEST_RECEPCIONES_DATABASE_URL;
if (!valor)
  throw Error(
    'Recepciones exige TEST_RECEPCIONES_DATABASE_URL local, exclusiva y migrada.',
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
  >`SELECT TABLE_NAME nombre FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME NOT IN ('_prisma_migrations','recepciones_compra','comprobantes_recepcion_compra','sesiones') ORDER BY TABLE_NAME`;
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
const contar = () =>
  Promise.all([
    prisma.recepcionCompra.count(),
    prisma.comprobanteRecepcionCompra.count(),
  ]);
async function fila(d: Solicitud) {
  return prisma.recepcionCompra.findUniqueOrThrow({
    where: { claveSolicitud: d.claveSolicitud },
    include: { comprobantes: true },
  });
}
async function archivos() {
  try {
    return await readdir(path.join(privado, 'comprobantes'));
  } catch {
    return [];
  }
}
async function habilitarRevision(d: Solicitud) {
  const r = await fila(d);
  await prisma.comprobanteRecepcionCompra.update({
    where: { id: r.comprobantes[0].id },
    data: { proximaRevisionEn: new Date() },
  });
}

describe.sequential(
  'Recepción privada con HTTP, disco y MySQL temporal',
  () => {
    beforeAll(async () => {
      expect(await prisma.usuario.count()).toBe(0);
      expect(await prisma.recepcionCompra.count()).toBe(0);
      privado = await mkdtemp(path.join(tmpdir(), 'soho-recepciones-test-'));
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
        expect(path.basename(real)).toMatch(/^soho-recepciones-test-/);
        await rm(real, { recursive: true, force: true });
      }
    });

    it('confirma evidencia y conserva exactamente las demás tablas, sin crear pedido, pago o reserva', async () => {
      const d = await solicitud(),
        antes = await negocio(),
        n = await contar(),
        r = await post(d).expect(201),
        f = await fila(d);
      expect(r.body.recepcion).toMatchObject({
        id: f.id,
        referencia: f.referencia,
        estado: 'RECIBIDA',
        version: 2,
        accesoExpiraEn: null,
        pedido: null,
        comprobante: {
          estadoArchivo: 'DISPONIBLE',
          numeroOperacion: '001234',
          formato: 'image/png',
        },
        capacidades: { procesamientoDisponible: false },
      });
      expect(f.referencia).toMatch(/^REC-[A-F0-9]{16}$/);
      expect(f.respuesta).toEqual(r.body);
      expect(await contar()).toEqual(n.map((x) => x + 1));
      expect(await negocio()).toEqual(antes);
      expect((await get(base + '/' + f.id).expect(200)).body).toEqual(r.body);
      expect(
        (await get(base + '/creacion/' + d.claveSolicitud).expect(200)).body,
      ).toEqual(r.body);
      expect((await post(d).expect(200)).body).toEqual(r.body);
      const texto = JSON.stringify(r.body);
      for (const privado of [
        'archivoClave',
        'archivoSha256',
        'solicitudHash',
        'tokenEscritura',
        'ultimaIncidencia',
        'accesoInvitadoHash',
        'responsableId',
      ])
        expect(texto).not.toContain(privado);
      expect(texto).not.toContain(f.comprobantes[0].archivoClave);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
    });
    it('sirve la imagen saneada por streaming privado sin nombre original ni caché', async () => {
      const d = await solicitud(),
        r = await post(d).expect(201),
        f = await fila(d),
        c = f.comprobantes[0];
      const imagen = await get(
        base + '/' + f.id + '/comprobantes/' + c.id,
      ).expect(200);
      expect(imagen.headers['content-type']).toContain('image/png');
      expect(imagen.headers['content-disposition']).toBe(
        'inline; filename="comprobante.png"',
      );
      expect(Buffer.isBuffer(imagen.body)).toBe(true);
      expect(
        createHash('sha256')
          .update(imagen.body as Buffer)
          .digest('hex'),
      ).toBe(c.archivoSha256);
      expect((imagen.body as Buffer).length).toBe(
        r.body.recepcion.comprobante.tamanoBytes,
      );
      expect(imagen.headers['cache-control']).toBe('no-store');
      await get(base + '/' + f.id + '/comprobantes/' + randomUUID()).expect(
        404,
      );
    });
    it('cuenta, otra cuenta y ADMIN conservan la propiedad de las rutas privadas', async () => {
      const d = await solicitud(),
        r = await post(d).expect(201),
        id = r.body.recepcion.id as string;
      for (const c of [otro, admin]) {
        await get(base + '/' + id, c).expect(404);
        await get(base + '/creacion/' + d.claveSolicitud, c).expect(404);
        await get(
          base + '/' + id + '/comprobantes/' + r.body.recepcion.comprobante.id,
          c,
        ).expect(404);
        await post(d, c).expect(404);
      }
      const propia = await solicitud(admin);
      await post(propia, admin).expect(201);
      await request(app.getHttpServer())
        .get(base + '/' + id)
        .expect(401);
    });
    it('invitado usa su secreto y un vencimiento nuevo desde el registro, sin atribuir por correo', async () => {
      const c = await cuenta(),
        d = await solicitud(c),
        r = await post(d, c).expect(201),
        f = await fila(d);
      expect(
        new Date(r.body.recepcion.accesoExpiraEn).getTime() -
          f.creadoEn.getTime(),
      ).toBe(30 * 86400000);
      expect((await get(base + '/' + f.id, c).expect(200)).body).toEqual(
        r.body,
      );
      for (const otra of [cliente, admin, await cuenta()])
        await get(base + '/' + f.id, otra).expect(404);
      const i = await prisma.instruccionPago.findUniqueOrThrow({
        where: { id: d.instruccionPagoId },
      });
      expect(i.accesoInvitadoHash).toBe(
        createHash('sha256').update(c.secreto!).digest('hex'),
      );
      expect(JSON.stringify(r.body)).not.toContain(c.secreto);
    });
    it('el invitado conserva su recepción cuando vence el acceso directo a la instrucción', async () => {
      const c = await cuenta(),
        d = await solicitud(c),
        i = await prisma.instruccionPago.findUniqueOrThrow({
          where: { id: d.instruccionPagoId },
        }),
        antigua = new Date(Date.now() - 29 * 86400000),
        q = i.respuesta as Record<string, any>;
      await prisma.instruccionPago.update({
        where: { id: i.id },
        data: {
          emitidaEn: antigua,
          respuesta: {
            ...q,
            emitidaEn: antigua.toISOString(),
            accesoExpiraEn: new Date(
              antigua.getTime() + 30 * 86400000,
            ).toISOString(),
          },
        },
      });
      const r = await post(d, c).expect(201);
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 86400000);
      await get('/api/pagos/instrucciones/' + i.id, c).expect(404);
      expect(
        (await get(base + '/' + r.body.recepcion.id, c).expect(200)).body,
      ).toEqual(r.body);
      c.csrf = (await c.agente.get('/api/auth/csrf').expect(200)).body
        .csrfToken as string;
      expect((await post(d, c).expect(200)).body).toEqual(r.body);
    });
    it('vence el acceso invitado sin borrarlo ni renovarlo por reintento', async () => {
      const c = await cuenta(),
        d = await solicitud(c),
        r = await post(d, c).expect(201),
        creado = new Date(Date.now() - 31 * 86400000);
      await prisma.recepcionCompra.update({
        where: { id: r.body.recepcion.id as string },
        data: {
          creadoEn: creado,
          accesoInvitadoExpiraEn: new Date(creado.getTime() + 30 * 86400000),
        },
      });
      await get(base + '/' + r.body.recepcion.id, c).expect(404);
      await post(d, c).expect(404);
      expect(
        await prisma.recepcionCompra.count({
          where: { id: r.body.recepcion.id as string },
        }),
      ).toBe(1);
    });
    it('acepta evidencia histórica con emisión pausada y método actualmente desactivado', async () => {
      const d = await solicitud();
      await publicar(false);
      activa = false;
      const r = await post(d).expect(201);
      expect(r.body.recepcion.instruccion.destino.titular).toBe(
        'SOHO sintético',
      );
      expect((await post(d).expect(200)).body).toEqual(r.body);
      await publicar();
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
      'conserva preparación de %s aunque cambie cobertura/precio después de emitir',
      async (distrito) => {
        const z = await prisma.zonaEntrega.findUniqueOrThrow({
          where: { codigo: distrito },
        });
        try {
          const tarifa = distrito === 'la-esperanza' ? '0.00' : '6.00';
          await prisma.zonaEntrega.update({
            where: { id: z.id },
            data: { habilitada: true, tarifa, plazo: null },
          });
          const d = await solicitud(cliente, (p) => {
            p.entrega.distrito = distrito;
            p.cotizacion.costoEnvio = tarifa;
            p.cotizacion.total = tarifa === '0.00' ? '199.98' : '205.98';
          });
          await prisma.zonaEntrega.update({
            where: { id: z.id },
            data: {
              habilitada: false,
              tarifa: distrito === 'la-esperanza' ? '0.00' : null,
            },
          });
          await prisma.producto.update({
            where: { id: productoId },
            data: { precio: '120.00', estado: 'ARCHIVADO' },
          });
          const antes = await negocio(),
            r = await post(d).expect(201);
          expect(
            r.body.recepcion.instruccion.preparacion.entrega.distrito,
          ).toBe(distrito);
          expect(r.body.recepcion.instruccion.importeReferencia).toBe(
            tarifa === '0.00' ? '199.98' : '205.98',
          );
          expect(await negocio()).toEqual(antes);
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
          await prisma.producto.update({
            where: { id: productoId },
            data: { precio: '99.99', estado: 'PUBLICADO' },
          });
        }
      },
    );
    it('reconoce NFC y UUID en mayúsculas con la respuesta original', async () => {
      const d = await solicitud();
      d.comprobante.nombreArchivo = 'operación.png';
      const r = await post(d).expect(201);
      const e = structuredClone(d);
      e.claveSolicitud = e.claveSolicitud.toUpperCase();
      e.instruccionPagoId = e.instruccionPagoId.toUpperCase();
      e.comprobante.nombreArchivo = 'operacio\u0301n.png';
      expect((await post(e).expect(200)).body).toEqual(r.body);
    });
    it.each(['imagen', 'nombre', 'operacion', 'instruccion'])(
      'rechaza otra solicitud con la misma clave: %s',
      async (caso) => {
        const d = await solicitud(),
          r = await post(d).expect(201),
          otro = structuredClone(d);
        if (caso === 'imagen')
          otro.comprobante.contenidoBase64 = Buffer.concat([
            Buffer.from(d.comprobante.contenidoBase64, 'base64'),
            Buffer.from('otro original'),
          ]).toString('base64');
        if (caso === 'nombre') otro.comprobante.nombreArchivo = 'otro.png';
        if (caso === 'operacion') otro.comprobante.numeroOperacion = '00002';
        if (caso === 'instruccion')
          otro.instruccionPagoId = (await solicitud()).instruccionPagoId;
        const n = await contar();
        await post(otro).expect(409);
        expect(await contar()).toEqual(n);
        expect(
          (await get(base + '/' + r.body.recepcion.id).expect(200)).body,
        ).toEqual(r.body);
      },
    );
    it('otra clave con idéntica instrucción/imagen recupera la recepción y devuelve su clave canónica', async () => {
      const d = await solicitud(),
        r = await post(d).expect(201),
        e = { ...d, claveSolicitud: randomUUID() },
        n = await contar();
      expect((await post(e).expect(200)).body).toEqual(r.body);
      expect(await contar()).toEqual(n);
      await get(base + '/creacion/' + e.claveSolicitud).expect(404);
    });

    it.each([
      [
        'propietario',
        (d: any) => {
          d.usuarioId = randomUUID();
        },
      ],
      [
        'cotización',
        (d: any) => {
          d.preparacion = {};
        },
      ],
      [
        'UUID',
        (d: any) => {
          d.instruccionPagoId = 'no-uuid';
        },
      ],
      [
        'nombre con ruta',
        (d: any) => {
          d.comprobante.nombreArchivo = '../recibo.png';
        },
      ],
      [
        'nombre invisible',
        (d: any) => {
          d.comprobante.nombreArchivo = 're\u200bcibo.png';
        },
      ],
      [
        'operación numérica',
        (d: any) => {
          d.comprobante.numeroOperacion = 123;
        },
      ],
      [
        'operación larga',
        (d: any) => {
          d.comprobante.numeroOperacion = '1'.repeat(13);
        },
      ],
      [
        'MIME',
        (d: any) => {
          d.comprobante.tipoArchivo = 'text/html';
        },
      ],
      [
        'base64 no canónico',
        (d: any) => {
          d.comprobante.contenidoBase64 = 'YR==';
        },
      ],
      [
        'imagen falsa',
        (d: any) => {
          d.comprobante.contenidoBase64 =
            Buffer.from('falsa').toString('base64');
        },
      ],
      [
        'MIME incoherente',
        (d: any) => {
          d.comprobante.tipoArchivo = 'image/jpeg';
        },
      ],
      [
        'campo extra de archivo',
        (d: any) => {
          d.comprobante.archivoClave = '/privado';
        },
      ],
    ])(
      'rechaza %s sin reservar identidad ni escribir en disco',
      async (_caso, cambiar) => {
        const d = await solicitud(),
          n = await contar(),
          antes = await archivos();
        cambiar(d);
        await post(d).expect(400);
        expect(await contar()).toEqual(n);
        expect(await archivos()).toEqual(antes);
      },
    );
    it('requiere origen, CSRF y credencial; limita antes de cargar el JSON grande', async () => {
      const d = await solicitud(),
        n = await contar();
      await cliente.agente.post(base).set('Origin', origen).send(d).expect(403);
      await cliente.agente
        .post(base)
        .set('Origin', 'https://otro.test')
        .set('X-CSRF-Token', cliente.csrf)
        .send(d)
        .expect(403);
      await request(app.getHttpServer())
        .post(base)
        .set('Origin', origen)
        .send(d)
        .expect(403);
      limites.comprobar.mockImplementationOnce((_tipo, _req, res) => {
        res.setHeader('Retry-After', '60');
        throw new HttpException('Demasiados intentos', 429);
      });
      const r = await post(d).expect(429);
      expect(r.headers['retry-after']).toBe('60');
      expect(r.headers['cache-control']).toBe('no-store');
      expect(await contar()).toEqual(n);
    });
    it('acepta JSON válido de más de 16 KiB y sanea el contenido añadido a la imagen', async () => {
      const d = await solicitud();
      d.comprobante.contenidoBase64 = Buffer.concat([
        Buffer.from(d.comprobante.contenidoBase64, 'base64'),
        Buffer.alloc(20 * 1024, 65),
      ]).toString('base64');
      const r = await post(d).expect(201);
      expect(r.body.recepcion.comprobante.tamanoBytes).toBeLessThan(20 * 1024);
    });
    it('recibe Plin sin facturación, conservando la respuesta JSON normalizada', async () => {
      const d = await solicitud(
          cliente,
          (p) => {
            p.facturacion = undefined;
          },
          'PLIN',
        ),
        r = await post(d).expect(201);
      expect(r.body.recepcion.instruccion.metodo).toBe('PLIN');
      expect(r.body.recepcion.instruccion.preparacion).not.toHaveProperty(
        'facturacion',
      );
      expect((await post(d).expect(200)).body).toEqual(r.body);
      expect(
        (await get(base + '/' + r.body.recepcion.id).expect(200)).body,
      ).toEqual(r.body);
    });
    it('reserva identidad antes del IO y permite reenviar la misma imagen cuando falta el archivo', async () => {
      const d = await solicitud(),
        servicio = app.get(ComprobantesPrivadosService),
        n = await contar(),
        a = await archivos();
      vi.spyOn(servicio, 'guardarReservado').mockImplementationOnce(
        async (reserva) => {
          const f = await fila(d);
          expect(f.estado).toBe('RECIBIENDO');
          expect(f.comprobantes[0].archivoClave).toBe(reserva.clave);
          throw new ServiceUnavailableException(
            'Disco sintético no disponible',
          );
        },
      );
      const r = await post(d).expect(202);
      expect(r.headers['retry-after']).toBe('5');
      expect(r.body.recepcion).toMatchObject({
        estado: 'RECIBIENDO',
        recibidaEn: null,
        comprobante: { estadoArchivo: 'PENDIENTE' },
        capacidades: { reenviarMismaImagen: true, consultarComprobante: false },
      });
      expect(await contar()).toEqual(n.map((x) => x + 1));
      expect(await archivos()).toEqual(a);
      const f = await fila(d);
      await get(
        base + '/' + f.id + '/comprobantes/' + f.comprobantes[0].id,
      ).expect(404);
      const pendiente = await get(
        base + '/creacion/' + d.claveSolicitud,
      ).expect(200);
      expect(pendiente.body.recepcion.estado).toBe('RECIBIENDO');
      const final = await post(d).expect(200);
      expect(final.body.recepcion.id).toBe(f.id);
      expect(final.body.recepcion.estado).toBe('RECIBIDA');
      expect((await fila(d)).comprobantes[0].archivoClave).toBe(
        f.comprobantes[0].archivoClave,
      );
    });
    it('GET recupera un archivo ya escrito tras perder la confirmación sin reenviar la imagen', async () => {
      const d = await solicitud(),
        servicio = app.get(ComprobantesPrivadosService),
        original = servicio.guardarReservado.bind(servicio);
      vi.spyOn(servicio, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          await original(...args);
          throw new Error('Caída después de escribir');
        },
      );
      await post(d).expect(202);
      const f = await fila(d),
        a = await archivos();
      expect(
        await readFile(path.join(privado, f.comprobantes[0].archivoClave)),
      ).toHaveLength(f.comprobantes[0].tamanoBytes);
      await habilitarRevision(d);
      const r = await get(base + '/creacion/' + d.claveSolicitud).expect(200);
      expect(r.body.recepcion.estado).toBe('RECIBIDA');
      expect(r.body.recepcion.id).toBe(f.id);
      expect(await archivos()).toEqual(a);
      expect((await post(d).expect(200)).body).toEqual(r.body);
    });
    it('recupera por GET un temporal completo tras una caída anterior a publicar el archivo', async () => {
      const d = await solicitud(),
        servicio = app.get(ComprobantesPrivadosService);
      vi.spyOn(servicio, 'guardarReservado').mockImplementationOnce(
        async (reserva, preparado) => {
          await writeFile(
            path.join(privado, reserva.clave + '.' + randomUUID() + '.tmp'),
            preparado.contenido,
          );
          throw new Error(
            'Proceso interrumpido antes de publicar la identidad',
          );
        },
      );
      await post(d).expect(202);
      await habilitarRevision(d);
      const r = await get(base + '/creacion/' + d.claveSolicitud).expect(200);
      expect(r.body.recepcion.estado).toBe('RECIBIDA');
      expect((await archivos()).filter((x) => x.endsWith('.tmp'))).toEqual([]);
    });
    it('un temporal parcial mantiene la recepción pendiente hasta reenviar la misma imagen', async () => {
      const d = await solicitud(),
        servicio = app.get(ComprobantesPrivadosService);
      vi.spyOn(servicio, 'guardarReservado').mockImplementationOnce(
        async (reserva, preparado) => {
          await writeFile(
            path.join(privado, reserva.clave + '.' + randomUUID() + '.tmp'),
            preparado.contenido.subarray(0, 10),
          );
          throw new Error('Proceso interrumpido durante escritura');
        },
      );
      const r = await post(d).expect(202);
      await habilitarRevision(d);
      const pendiente = await get(
        base + '/creacion/' + d.claveSolicitud,
      ).expect(200);
      expect(pendiente.body.recepcion.estado).toBe('RECIBIENDO');
      const final = await post(d).expect(200);
      expect(final.body.recepcion.id).toBe(r.body.recepcion.id);
      expect(final.body.recepcion.estado).toBe('RECIBIDA');
      const { unlink } = await import('node:fs/promises');
      const f = await fila(d);
      for (const nombre of await archivos())
        if (
          nombre.startsWith(
            f.comprobantes[0].archivoClave.split('/')[1] + '.',
          ) &&
          nombre.endsWith('.tmp')
        )
          await unlink(path.join(privado, 'comprobantes', nombre));
    });
    it('solo una de dos instrucciones del mismo checkout puede recibir evidencia concurrentemente', async () => {
      const d = await solicitud(),
        i = await prisma.instruccionPago.findUniqueOrThrow({
          where: { id: d.instruccionPagoId },
        }),
        respuesta = i.respuesta as Record<string, any>,
        nueva = await cliente.agente
          .post('/api/pagos/instrucciones')
          .set('Origin', origen)
          .set('X-CSRF-Token', cliente.csrf)
          .send({
            claveSolicitud: randomUUID(),
            claveCreacionPedido: i.claveCreacionPedido,
            metodo: 'PLIN',
            versionConfiguracionEsperada: respuesta.versionConfiguracion,
            preparacion: respuesta.preparacion,
          })
          .expect(201),
        e = {
          ...d,
          claveSolicitud: randomUUID(),
          instruccionPagoId: nueva.body.instruccionId as string,
        },
        n = await contar(),
        resultados = await Promise.all([post(d), post(e)]);
      expect(resultados.map((x) => x.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await contar()).toEqual(n.map((x) => x + 1));
    });
    it('recupera un COMMIT de recepción cuyo retorno se perdió y conserva el archivo fuente', async () => {
      const d = await solicitud(),
        archivosServicio = app.get(ComprobantesPrivadosService),
        guardar = archivosServicio.guardarReservado.bind(archivosServicio),
        escritura = app.get(EscrituraAutorizadaService),
        transaccion = escritura.transaccion.bind(escritura);
      vi.spyOn(archivosServicio, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          await guardar(...args);
          vi.spyOn(escritura, 'transaccion').mockImplementationOnce(
            async (op) => {
              await transaccion(op);
              throw new Error('Retorno de COMMIT perdido');
            },
          );
        },
      );
      const n = await contar(),
        r = await post(d).expect(201);
      expect(r.body.recepcion.estado).toBe('RECIBIDA');
      expect(await contar()).toEqual(n.map((x) => x + 1));
      expect((await post(d).expect(200)).body).toEqual(r.body);
      const f = await fila(d);
      expect(
        await readFile(path.join(privado, f.comprobantes[0].archivoClave)),
      ).toHaveLength(f.comprobantes[0].tamanoBytes);
    });
    it('recupera la reserva confirmada cuando se pierde su retorno antes del IO', async () => {
      const d = await solicitud(),
        archivosServicio = app.get(ComprobantesPrivadosService),
        preparar = archivosServicio.preparar.bind(archivosServicio),
        escritura = app.get(EscrituraAutorizadaService),
        transaccion = escritura.transaccion.bind(escritura);
      vi.spyOn(archivosServicio, 'preparar').mockImplementationOnce(
        async (...args) => {
          const p = await preparar(...args);
          vi.spyOn(escritura, 'transaccion').mockImplementationOnce(
            async (op) => {
              await transaccion(op);
              throw new Error('Reserva confirmada sin retorno');
            },
          );
          return p;
        },
      );
      const n = await contar(),
        r = await post(d).expect(200);
      expect(r.body.recepcion.estado).toBe('RECIBIDA');
      expect(await contar()).toEqual(n.map((x) => x + 1));
      expect((await post(d).expect(200)).body).toEqual(r.body);
    });
    it('un rollback de reserva no deja recepción, archivo ni modificaciones comerciales', async () => {
      const d = await solicitud(),
        archivosServicio = app.get(ComprobantesPrivadosService),
        preparar = archivosServicio.preparar.bind(archivosServicio),
        escritura = app.get(EscrituraAutorizadaService),
        transaccion = escritura.transaccion.bind(escritura),
        n = await contar(),
        a = await archivos(),
        antes = await negocio();
      vi.spyOn(archivosServicio, 'preparar').mockImplementationOnce(
        async (...args) => {
          const p = await preparar(...args);
          vi.spyOn(escritura, 'transaccion').mockImplementationOnce(
            async (op) =>
              transaccion(async (tx) => {
                await op(tx);
                throw new Error('Rollback sintético');
              }),
          );
          return p;
        },
      );
      await expect(
        app.get(RecepcionesCompraService).recibir(d, await contexto()),
      ).rejects.toThrow('Rollback sintético');
      expect(await contar()).toEqual(n);
      expect(await archivos()).toEqual(a);
      expect(await negocio()).toEqual(antes);
    });
    it('una respuesta HTTP perdida se recupera por clave sin duplicar datos ni archivo', async () => {
      const d = await solicitud(),
        n = await contar();
      perder = d.claveSolicitud;
      await expect(post(d)).rejects.toThrow();
      const r = await get(base + '/creacion/' + d.claveSolicitud).expect(200);
      expect(r.body.recepcion.estado).toBe('RECIBIDA');
      expect((await post(d).expect(200)).body).toEqual(r.body);
      expect(await contar()).toEqual(n.map((x) => x + 1));
    });
    it('dos envíos simultáneos conservan una recepción y un escritor activo', async () => {
      const d = await solicitud(),
        n = await contar(),
        servicio = app.get(ComprobantesPrivadosService),
        original = servicio.guardarReservado.bind(servicio),
        entrada = puerta(),
        salida = puerta();
      vi.spyOn(servicio, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          entrada.abrir();
          await salida.promesa;
          await original(...args);
        },
      );
      const primero = post(d).then((r) => r);
      await entrada.promesa;
      try {
        const segundo = await post(d).expect(202);
        expect(segundo.body.recepcion.estado).toBe('RECIBIENDO');
        const actual = await get(base + '/creacion/' + d.claveSolicitud).expect(
          200,
        );
        expect(actual.body.recepcion.estado).toBe('RECIBIENDO');
        expect(await contar()).toEqual(n.map((x) => x + 1));
      } finally {
        salida.abrir();
      }
      const final = await primero;
      expect(final.status).toBe(201);
      expect((await post(d).expect(200)).body).toEqual(final.body);
      expect(await contar()).toEqual(n.map((x) => x + 1));
    });
    it('un lease vencido admite otro escritor sin que el anterior sobrescriba el resultado', async () => {
      const d = await solicitud(),
        servicio = app.get(ComprobantesPrivadosService),
        original = servicio.guardarReservado.bind(servicio),
        entrada = puerta(),
        salida = puerta();
      vi.spyOn(servicio, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          entrada.abrir();
          await salida.promesa;
          await original(...args);
        },
      );
      const primero = post(d).then((r) => r);
      await entrada.promesa;
      let segundo: Awaited<ReturnType<typeof post>>;
      try {
        const r = await fila(d);
        await prisma.comprobanteRecepcionCompra.update({
          where: { id: r.comprobantes[0].id },
          data: {
            bloqueoEscrituraHasta: new Date(Date.now() - 1),
            proximaRevisionEn: new Date(),
          },
        });
        segundo = await post(d).expect(200);
        expect(segundo.body.recepcion.estado).toBe('RECIBIDA');
      } finally {
        salida.abrir();
      }
      expect((await primero).body).toEqual(segundo!.body);
      const r = await fila(d);
      expect(r.version).toBe(2);
      expect(r.comprobantes).toHaveLength(1);
      expect((await archivos()).filter((x) => x.endsWith('.tmp'))).toEqual([]);
    });
    it('dos claves concurrentes de la misma compra recuperan una única referencia', async () => {
      const d = await solicitud(),
        e = { ...d, claveSolicitud: randomUUID() },
        n = await contar(),
        resultados = await Promise.all([post(d), post(e)]);
      expect(resultados.every((r) => [200, 201, 202].includes(r.status))).toBe(
        true,
      );
      expect(new Set(resultados.map((r) => r.body.recepcion.id)).size).toBe(1);
      expect(await contar()).toEqual(n.map((x) => x + 1));
    });
    it('revocar la sesión durante preparación impide reservar identidad', async () => {
      const c = await cuenta('CLIENTE'),
        d = await solicitud(c),
        servicio = app.get(ComprobantesPrivadosService),
        preparar = servicio.preparar.bind(servicio),
        n = await contar();
      vi.spyOn(servicio, 'preparar').mockImplementationOnce(async (...args) => {
        const p = await preparar(...args);
        await prisma.sesion.updateMany({
          where: { usuarioId: c.id },
          data: { revocadaEn: new Date() },
        });
        return p;
      });
      await post(d, c).expect(401);
      expect(await contar()).toEqual(n);
    });
    it('revocación después de escribir conserva evidencia y permite recuperarla con una nueva sesión propia', async () => {
      const c = await cuenta('CLIENTE'),
        d = await solicitud(c),
        servicio = app.get(ComprobantesPrivadosService),
        original = servicio.guardarReservado.bind(servicio);
      vi.spyOn(servicio, 'guardarReservado').mockImplementationOnce(
        async (...args) => {
          await original(...args);
          await prisma.sesion.updateMany({
            where: { usuarioId: c.id },
            data: { revocadaEn: new Date() },
          });
        },
      );
      await post(d, c).expect(401);
      const f = await fila(d);
      expect(f.estado).toBe('RECIBIENDO');
      expect(
        await readFile(path.join(privado, f.comprobantes[0].archivoClave)),
      ).toHaveLength(f.comprobantes[0].tamanoBytes);
      const agente = request.agent(app.getHttpServer()),
        csrf = (await agente.get('/api/auth/csrf').expect(200)).body
          .csrfToken as string,
        login = await agente
          .post('/api/auth/login')
          .set('Origin', origen)
          .set('X-CSRF-Token', csrf)
          .send({ correo: c.correo, clave })
          .expect(200);
      await prisma.comprobanteRecepcionCompra.update({
        where: { id: f.comprobantes[0].id },
        data: {
          bloqueoEscrituraHasta: new Date(Date.now() - 1),
          proximaRevisionEn: new Date(),
        },
      });
      const nueva = { ...c, agente, csrf: login.body.csrfToken as string };
      const r = await get(base + '/' + f.id, nueva).expect(200);
      expect(r.body.recepcion.estado).toBe('RECIBIDA');
    });
    it('revalida sesión después de leer la imagen antes de servir bytes privados', async () => {
      const c = await cuenta('CLIENTE'),
        d = await solicitud(c),
        r = await post(d, c).expect(201),
        servicio = app.get(ComprobantesPrivadosService),
        original = servicio.leer.bind(servicio);
      vi.spyOn(servicio, 'leer').mockImplementationOnce(async (...args) => {
        const b = await original(...args);
        await prisma.sesion.updateMany({
          where: { usuarioId: c.id },
          data: { revocadaEn: new Date() },
        });
        return b;
      });
      await get(
        base +
          '/' +
          r.body.recepcion.id +
          '/comprobantes/' +
          r.body.recepcion.comprobante.id,
        c,
      ).expect(401);
    });
    it('no inventa ni reemplaza un archivo alterado y conserva la recepción confirmada', async () => {
      const d = await solicitud(),
        r = await post(d).expect(201),
        f = await fila(d),
        c = f.comprobantes[0];
      await writeFile(path.join(privado, c.archivoClave), 'alterado');
      await get(base + '/' + f.id + '/comprobantes/' + c.id).expect(503);
      expect((await post(d).expect(200)).body).toEqual(r.body);
      expect(await readFile(path.join(privado, c.archivoClave), 'utf8')).toBe(
        'alterado',
      );
    });
    it('un archivo ausente confirmado devuelve 503 al consultar sus bytes sin borrar su historial', async () => {
      const d = await solicitud(),
        r = await post(d).expect(201),
        f = await fila(d),
        c = f.comprobantes[0];
      await unlink(path.join(privado, c.archivoClave));
      await get(base + '/' + f.id + '/comprobantes/' + c.id).expect(503);
      expect((await get(base + '/' + f.id).expect(200)).body).toEqual(r.body);
    });
    it('rechaza respuestas almacenadas incompatibles sin devolver propiedades ajenas', async () => {
      const d = await solicitud(),
        r = await post(d).expect(201);
      await prisma.recepcionCompra.update({
        where: { id: r.body.recepcion.id as string },
        data: { respuesta: { secreto: 'no exponer' } },
      });
      const e = await get(base + '/' + r.body.recepcion.id).expect(503);
      expect(JSON.stringify(e.body)).not.toContain('no exponer');
      await post(d).expect(503);
    });
    it('cookie inválida no permite continuar como invitado y los filtros privados son estrictos', async () => {
      const c = await cuenta(),
        d = await solicitud(c),
        r = await post(d, c).expect(201);
      await request(app.getHttpServer())
        .get(base + '/' + r.body.recepcion.id)
        .set('Cookie', auth.cookieSesion + '=invalida')
        .set('X-Pedido-Acceso', c.secreto!)
        .expect(401);
      await get(base + '/' + r.body.recepcion.id + '?extra=1', c).expect(400);
      await get(base + '/creacion/invalida', c).expect(400);
      await get(base + '/invalida', c).expect(400);
    });
    it('una instrucción invitada vencida sin recepción no inicia una nueva carga', async () => {
      const c = await cuenta(),
        d = await solicitud(c),
        i = await prisma.instruccionPago.findUniqueOrThrow({
          where: { id: d.instruccionPagoId },
        });
      await prisma.instruccionPago.update({
        where: { id: i.id },
        data: { emitidaEn: new Date(Date.now() - 31 * 86400000) },
      });
      const n = await contar();
      await post(d, c).expect(404);
      expect(await contar()).toEqual(n);
    });
    it('rechaza JSON de más de 8 MiB, malformado y consulta adicional', async () => {
      const d = await solicitud(),
        n = await contar();
      await cliente.agente
        .post(base)
        .set('Origin', origen)
        .set('X-CSRF-Token', cliente.csrf)
        .send({ enorme: 'a'.repeat(8 * 1024 * 1024) })
        .expect(413);
      await cliente.agente
        .post(base)
        .set('Origin', origen)
        .set('X-CSRF-Token', cliente.csrf)
        .set('Content-Type', 'application/json')
        .send('{')
        .expect(400);
      await cliente.agente
        .post(base + '?extra=1')
        .set('Origin', origen)
        .set('X-CSRF-Token', cliente.csrf)
        .send(d)
        .expect(400);
      expect(await contar()).toEqual(n);
    });
  },
);
