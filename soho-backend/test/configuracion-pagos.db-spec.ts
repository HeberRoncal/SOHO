import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
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
import type { ContextoAuth } from '../src/autenticacion/sesiones/contexto-auth.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import {
  ConfiguracionCloudinary,
  HTTP_CLOUDINARY,
} from '../src/productos/fotografias/configuracion-cloudinary.js';
import { ConfiguracionPagosService } from '../src/configuracion-pagos/configuracion-pagos.service.js';
import { ArchivosQrService } from '../src/configuracion-pagos/qr/archivos-qr.service.js';
import { MantenimientoQrService } from '../src/configuracion-pagos/qr/mantenimiento-qr.service.js';
import { CloudinarySimulado } from './fotografias-proveedor.js';

const valor = process.env.TEST_CONFIGURACION_PAGOS_DATABASE_URL;
if (!valor)
  throw Error(
    'Pagos requiere TEST_CONFIGURACION_PAGOS_DATABASE_URL exclusiva.',
  );
const destino = new URL(obtenerUrlBaseDatos(valor));
if (
  !['localhost', '127.0.0.1'].includes(destino.hostname) ||
  !destino.pathname.endsWith('_test')
)
  throw Error('Pagos requiere MySQL local con sufijo _test.');
const prisma = crearClientePrisma(valor),
  proveedor = new CloudinarySimulado();
const config = new ConfiguracionCloudinary({
  CLOUDINARY_CLOUD_NAME: 'sintetico',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'secreto-sintetico',
  NODE_ENV: 'test',
});
const base = '/api/admin/configuracion/pagos',
  origen = 'http://localhost:4200',
  clave = 'Clave sintética pagos 2026';
type Cuenta = {
  agente: ReturnType<typeof request.agent>;
  csrf: string;
  id: string;
};
let app: INestApplication,
  privado: string,
  admin: Cuenta,
  otro: Cuenta,
  cliente: Cuenta,
  png: Buffer;
let archivos: ArchivosQrService,
  mantenimiento: MantenimientoQrService,
  servicio: ConfiguracionPagosService;
let perder: string | undefined;
async function cuenta(rol: 'ADMIN' | 'CLIENTE'): Promise<Cuenta> {
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Pagos',
      correo: randomUUID() + '@pagos.test',
      rol,
      claveHash: await new ClavesService().crear(clave),
    },
  });
  const agente = request.agent(app.getHttpServer()),
    csrf = (await agente.get('/api/auth/csrf').expect(200)).body
      .csrfToken as string;
  const r = await agente
    .post('/api/auth/login')
    .set('Origin', origen)
    .set('X-CSRF-Token', csrf)
    .send({ correo: u.correo, clave })
    .expect(200);
  return { agente, csrf: r.body.csrfToken as string, id: u.id };
}
async function contexto(c = admin): Promise<ContextoAuth> {
  const s = await prisma.sesion.findFirstOrThrow({
    where: { usuarioId: c.id, revocadaEn: null },
  });
  return {
    sesionId: s.id,
    usuario: {
      id: c.id,
      nombres: 'Ana',
      apellidos: 'Pagos',
      correo: 'prueba@pagos.test',
      rol: 'ADMIN',
      correoVerificado: false,
    },
  };
}
async function version() {
  return (await admin.agente.get(base).expect(200)).body.configuracion
    .version as number;
}
async function datos() {
  const actual = (await admin.agente.get(base).expect(200)).body.configuracion;
  if (actual.metodos.some((m: { activo: boolean }) => m.activo)) {
    await guardar({
      claveSolicitud: randomUUID(),
      versionEsperada: actual.version,
      confirmado: true,
      metodos: actual.metodos.map(
        (m: {
          metodo: string;
          celular: string | null;
          titular: string | null;
          qr: { id: string } | null;
        }) => ({
          metodo: m.metodo,
          activo: false,
          celular: m.celular,
          titular: m.titular,
          qrId: m.qr?.id ?? null,
        }),
      ),
    }).expect(200);
  }
  return {
    claveSolicitud: randomUUID() as string,
    versionEsperada: await version(),
    confirmado: true,
    metodos: [
      {
        metodo: 'YAPE',
        activo: true,
        celular: '987654321',
        titular: 'SOHO Yape',
        qrId: null as string | null,
      },
      {
        metodo: 'PLIN',
        activo: false,
        celular: null as string | null,
        titular: null as string | null,
        qrId: null as string | null,
      },
    ],
  };
}
function guardar(d: unknown, c = admin) {
  return c.agente
    .patch(base)
    .set('Origin', origen)
    .set('X-CSRF-Token', c.csrf)
    .send(d as object);
}
function subir(
  claveCarga: string = randomUUID(),
  metodo = 'YAPE',
  c = admin,
  buffer = png,
  mime = 'image/png',
) {
  return c.agente
    .post(base + '/qr')
    .set('Origin', origen)
    .set('X-CSRF-Token', c.csrf)
    .field('datos', JSON.stringify({ claveCarga, metodo }))
    .attach('archivo', buffer, { filename: 'qr.png', contentType: mime });
}
async function archivo() {
  return prisma.archivoQrPago.findUniqueOrThrow({
    where: { id: (await subir().expect(201)).body.archivo.id as string },
  });
}
async function vencer(
  id: string,
  campo: 'limpiarDesde' | 'proximaRevisionEn' = 'limpiarDesde',
) {
  return prisma.archivoQrPago.update({
    where: { id },
    data: { [campo]: new Date(Date.now() - 1000) },
  });
}
const puerta = () => {
  let abrir!: () => void;
  const promesa = new Promise<void>((resolve) => {
    abrir = resolve;
  });
  return { promesa, abrir };
};

describe.sequential(
  'Configuración Pagos/QR con HTTP, MySQL aislado y Cloudinary simulado',
  () => {
    beforeAll(async () => {
      expect(await prisma.usuario.count()).toBe(0);
      expect(await prisma.versionConfiguracionPagos.count()).toBe(0);
      privado = await mkdtemp(
        path.join(tmpdir(), 'soho-pagos-configuracion-test-'),
      );
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(CONFIGURACION_AUTH)
        .useValue(crearConfiguracionAuth({}))
        .overrideProvider(ConfiguracionCloudinary)
        .useValue(config)
        .overrideProvider(HTTP_CLOUDINARY)
        .useValue(proveedor.http)
        .overrideProvider(CorreosService)
        .useValue({ habilitado: () => false })
        .overrideProvider(LimitesAuthService)
        .useValue({ comprobar: vi.fn() })
        .overrideProvider(ConfiguracionPedidos)
        .useValue(
          new ConfiguracionPedidos({
            PEDIDOS_DIRECTORIO_PRIVADO: privado,
            NODE_ENV: 'test',
          }),
        )
        .compile();
      app = modulo.createNestApplication({ bodyParser: false });
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
              req.method === 'PATCH' &&
              req.path === base &&
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
      otro = await cuenta('ADMIN');
      cliente = await cuenta('CLIENTE');
      archivos = app.get(ArchivosQrService);
      mantenimiento = app.get(MantenimientoQrService);
      servicio = app.get(ConfiguracionPagosService);
      png = await sharp({
        create: { width: 48, height: 48, channels: 3, background: '#ffffff' },
      })
        .png()
        .toBuffer();
      // Compra anterior sintética; configurar cuentas no decide su revisión ni sus reservas.
      const p = await prisma.pedido.create({
        data: {
          codigo: 'SOHO-COMERCIALANTERIOR',
          claveCreacion: randomUUID(),
          solicitudHash: 'a'.repeat(64),
          usuarioId: cliente.id,
          nombres: 'Cliente',
          apellidos: 'Anterior',
          correo: 'anterior@pagos.test',
          destinatario: 'Cliente Anterior',
          celular: '987654321',
          distritoCodigo: 'moche',
          distritoNombre: 'Moche',
          direccion: 'Av. Prueba 123',
          subtotal: '100',
          costoEnvio: '6',
          total: '106',
          pago: { create: { metodo: 'YAPE', estado: 'APROBADO' } },
        },
      });
      expect(p.total.toFixed(2)).toBe('106.00');
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      await app?.close();
      await prisma.$disconnect();
      if (privado) {
        const real = await realpath(privado);
        expect(real.startsWith(await realpath(tmpdir()))).toBe(true);
        expect(path.basename(real)).toMatch(/^soho-pagos-configuracion-test-/);
        await rm(real, { recursive: true, force: true });
      }
    });
    afterEach(() => {
      vi.restoreAllMocks();
      proveedor.subidaEnEspera = undefined;
      proveedor.borradoEnEspera = undefined;
      proveedor.busquedaEnEspera = undefined;
      proveedor.contenidoIncorrecto = false;
      proveedor.falloBorrado = false;
    });

    it('presenta versión cero y métodos desactivados sin destinatarios ficticios', async () => {
      const r = await admin.agente.get(base).expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.configuracion).toMatchObject({
        version: 0,
        actualizadoPor: null,
        metodos: [
          {
            metodo: 'YAPE',
            activo: false,
            celular: null,
            titular: null,
            qr: null,
          },
          {
            metodo: 'PLIN',
            activo: false,
            celular: null,
            titular: null,
            qr: null,
          },
        ],
      });
      expect(r.body.capacidades.cargarQr).toBe(true);
    });
    it.each(['lectura', 'guardar', 'subir', 'operacion', 'carga'])(
      'exige autenticación y ADMIN en %s',
      async (caso) => {
        const anon = request(app.getHttpServer()),
          d = await datos();
        if (caso === 'lectura') {
          await anon.get(base).expect(401);
          await cliente.agente.get(base).expect(403);
        }
        if (caso === 'guardar') {
          await anon.patch(base).send(d).expect(401);
          await guardar(d, cliente).expect(403);
        }
        if (caso === 'subir') {
          await anon.post(base + '/qr').expect(401);
          await subir(randomUUID(), 'YAPE', cliente).expect(403);
        }
        if (caso === 'operacion') {
          await anon.get(base + '/operaciones/' + randomUUID()).expect(401);
          await cliente.agente
            .get(base + '/operaciones/' + randomUUID())
            .expect(403);
        }
        if (caso === 'carga') {
          await anon.get(base + '/qr/cargas/' + randomUUID()).expect(401);
          await cliente.agente
            .get(base + '/qr/cargas/' + randomUUID())
            .expect(403);
        }
      },
    );
    it('exige origen y CSRF antes de guardar o recibir multipart', async () => {
      const d = await datos();
      await admin.agente.patch(base).send(d).expect(403);
      await admin.agente
        .post(base + '/qr')
        .field('datos', '{}')
        .attach('archivo', png, 'qr.png')
        .expect(403);
      await admin.agente
        .patch(base)
        .set('Origin', 'https://ajeno.test')
        .set('X-CSRF-Token', admin.csrf)
        .send(d)
        .expect(403);
    });
    it.each([
      'extra',
      'sin-confirmar',
      'version-texto',
      'version-negativa',
      'version-fraccion',
      'un-metodo',
      'repetido',
      'metodo-ajeno',
      'activo-texto',
      'celular',
      'titular',
      'url',
      'qr-id',
      'qr-repetido',
    ])('rechaza contrato inválido %s sin publicar', async (caso) => {
      const d = await datos(),
        antes = await prisma.versionConfiguracionPagos.count();
      const raw = d as Record<string, unknown>;
      if (caso === 'extra') raw.precio = 1;
      if (caso === 'sin-confirmar') d.confirmado = false;
      if (caso === 'version-texto') raw.versionEsperada = '0';
      if (caso === 'version-negativa') d.versionEsperada = -1;
      if (caso === 'version-fraccion') d.versionEsperada = 1.2;
      if (caso === 'un-metodo') d.metodos.pop();
      if (caso === 'repetido') d.metodos[1] = d.metodos[0];
      if (caso === 'metodo-ajeno') d.metodos[0].metodo = 'TARJETA';
      if (caso === 'activo-texto')
        (d.metodos[0] as Record<string, unknown>).activo = 'true';
      if (caso === 'celular') d.metodos[0].celular = '+51987654321';
      if (caso === 'titular') d.metodos[0].titular = ' ';
      if (caso === 'url')
        (d.metodos[0] as Record<string, unknown>).url =
          'https://ajeno.test/qr.png';
      if (caso === 'qr-id') d.metodos[0].qrId = '123';
      if (caso === 'qr-repetido')
        d.metodos.forEach(
          (m) => (m.qrId = '00000000-0000-4000-8000-000000000001'),
        );
      await guardar(d).expect(400);
      expect(await prisma.versionConfiguracionPagos.count()).toBe(antes);
    });
    it('publica los dos métodos con responsable y admite activo sin QR', async () => {
      const r = await guardar(await datos()).expect(200);
      expect(r.body.configuracion).toMatchObject({
        version: 1,
        actualizadoPor: { id: admin.id },
        metodos: [
          { metodo: 'YAPE', activo: true, qr: null },
          { metodo: 'PLIN', activo: false },
        ],
      });
      expect(await prisma.metodoPagoConfigurado.count()).toBe(2);
    });
    it('normaliza textos y orden de métodos para recuperar sin duplicar', async () => {
      const d = await datos();
      d.metodos[0].titular = '  SOHO Yape  ';
      const r = await guardar(d).expect(200);
      d.metodos.reverse();
      d.metodos[1].titular = 'SOHO Yape';
      expect((await guardar(d).expect(200)).body).toEqual(r.body);
      expect(
        (
          await admin.agente
            .get(base + '/operaciones/' + d.claveSolicitud)
            .expect(200)
        ).body,
      ).toEqual(r.body);
    });
    it('mismo identificador con otro cuerpo o responsable produce conflicto y no filtra operación', async () => {
      const d = await datos();
      await guardar(d).expect(200);
      d.metodos[0].celular = '912345678';
      await guardar(d).expect(409);
      await guardar(d, otro).expect(409);
      await otro.agente
        .get(base + '/operaciones/' + d.claveSolicitud)
        .expect(404);
    });
    it('una versión antigua no sobrescribe la publicación actual', async () => {
      const d = await datos();
      await guardar(d).expect(200);
      d.claveSolicitud = randomUUID();
      await guardar(d).expect(409);
    });
    it('dos administradores con la misma versión publican solo una vez', async () => {
      const a = await datos(),
        b = { ...a, claveSolicitud: randomUUID() };
      const antes = await prisma.versionConfiguracionPagos.count();
      const r = await Promise.all([guardar(a), guardar(b, otro)]);
      expect(r.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect(await prisma.versionConfiguracionPagos.count()).toBe(antes + 1);
    });
    it('recupera respuesta perdida tras COMMIT y después de otra publicación', async () => {
      const d = await datos();
      perder = d.claveSolicitud;
      await expect(guardar(d)).rejects.toThrow();
      const r = await admin.agente
        .get(base + '/operaciones/' + d.claveSolicitud)
        .expect(200);
      await guardar(await datos()).expect(200);
      expect((await guardar(d).expect(200)).body).toEqual(r.body);
    });
    it('ambos métodos desactivados constituye una publicación válida', async () => {
      const d = await datos();
      d.metodos.forEach((m) => {
        m.activo = false;
        m.celular = null;
        m.titular = null;
      });
      const r = await guardar(d).expect(200);
      expect(
        r.body.configuracion.metodos.every(
          (m: { activo: boolean }) => !m.activo,
        ),
      ).toBe(true);
    });
    it('carga un QR con identidad propia, PNG sin pérdida y sin publicarlo automáticamente', async () => {
      const actual = await version(),
        a = await archivo();
      expect(a.estado).toBe('DISPONIBLE');
      expect(a.carpetaCloudinary).toMatch(/^SOHO\/pagos\/yape\//);
      expect(a.hashContenido).toMatch(/^[a-f0-9]{64}$/);
      expect(await version()).toBe(actual);
      const bytes = proveedor.recursos.get(a.publicId)!.contenido;
      expect(await sharp(bytes).raw().toBuffer()).toEqual(
        await sharp(png).raw().toBuffer(),
      );
    });
    it('repetir una carga confirmada conserva recurso y evita otra llamada externa', async () => {
      const key = randomUUID(),
        a = await subir(key).expect(201),
        n = proveedor.peticiones.subidas;
      expect((await subir(key).expect(201)).body).toEqual(a.body);
      expect(proveedor.peticiones.subidas).toBe(n);
      await subir(key, 'PLIN').expect(409);
      await subir(key, 'YAPE', otro).expect(409);
      await otro.agente.get(base + '/qr/cargas/' + key).expect(404);
    });
    it.each([
      'sin-archivo',
      'corrupto',
      'mime',
      'grande',
      'dimensiones',
      'extra',
      'datos-duplicados',
    ])('rechaza archivo o multipart inválido %s', async (caso) => {
      const n = await prisma.archivoQrPago.count();
      if (caso === 'sin-archivo')
        await admin.agente
          .post(base + '/qr')
          .set('Origin', origen)
          .set('X-CSRF-Token', admin.csrf)
          .field(
            'datos',
            JSON.stringify({ claveCarga: randomUUID(), metodo: 'YAPE' }),
          )
          .expect(400);
      if (caso === 'corrupto')
        await subir(randomUUID(), 'YAPE', admin, Buffer.alloc(32)).expect(400);
      if (caso === 'mime')
        await subir(randomUUID(), 'YAPE', admin, png, 'image/jpeg').expect(400);
      if (caso === 'grande')
        await subir(
          randomUUID(),
          'YAPE',
          admin,
          Buffer.alloc(2 * 1024 * 1024 + 1),
        ).expect(413);
      if (caso === 'dimensiones')
        await subir(
          randomUUID(),
          'YAPE',
          admin,
          await sharp({
            create: { width: 4097, height: 1, channels: 3, background: '#fff' },
          })
            .png()
            .toBuffer(),
        ).expect(400);
      if (caso === 'extra' || caso === 'datos-duplicados')
        await admin.agente
          .post(base + '/qr')
          .set('Origin', origen)
          .set('X-CSRF-Token', admin.csrf)
          .field('datos', '{}')
          .field(caso === 'extra' ? 'otro' : 'datos', '{}')
          .attach('archivo', png, 'qr.png')
          .expect(400);
      expect(await prisma.archivoQrPago.count()).toBe(n);
    });
    it.each(['PLIN', 'YAPE'])(
      'carga %s y publica su QR confirmado en su método',
      async (metodo) => {
        const a = (await subir(randomUUID(), metodo).expect(201)).body.archivo;
        const d = await datos();
        d.metodos.find((m) => m.metodo === metodo)!.qrId = a.id;
        expect(
          (await guardar(d).expect(200)).body.configuracion.metodos.find(
            (m: { metodo: string }) => m.metodo === metodo,
          ).qr.id,
        ).toBe(a.id);
      },
    );
    it('rechaza QR de otro método y ajeno sin publicar', async () => {
      const a = await archivo(),
        d = await datos();
      d.metodos[1].qrId = a.id;
      await guardar(d).expect(422);
      d.metodos[1].qrId = null;
      d.metodos[0].qrId = a.id;
      await guardar(d, otro).expect(422);
    });
    it('otro administrador puede conservar un QR que ya forma parte de una publicación', async () => {
      const a = await archivo(),
        d = await datos();
      d.metodos[0].qrId = a.id;
      await guardar(d).expect(200);
      d.claveSolicitud = randomUUID();
      d.versionEsperada = await version();
      await guardar(d, otro).expect(200);
    });
    it.each(['antes', 'despues'] as const)(
      'concilia pérdida %s sin repetir POST',
      async (fallo) => {
        proveedor.falloSubida = fallo;
        const key = randomUUID(),
          r = await subir(key).expect(202),
          id = r.body.archivo.id as string;
        const n = proveedor.peticiones.subidas;
        await subir(key).expect(202);
        expect(proveedor.peticiones.subidas).toBe(n);
        if (fallo === 'antes')
          await proveedor.materializar(proveedor.respuestaPerdida!);
        await vencer(id, 'proximaRevisionEn');
        const a = await admin.agente
          .get(base + '/qr/cargas/' + key)
          .expect(200);
        expect(a.body.archivo.estado).toBe('DISPONIBLE');
        expect(proveedor.peticiones.subidas).toBe(n);
      },
    );
    it('ausencia externa y contenido manipulado conservan resultado pendiente sin publicar', async () => {
      proveedor.falloSubida = 'antes';
      const key = randomUUID(),
        r = await subir(key).expect(202),
        id = r.body.archivo.id as string;
      await vencer(id, 'proximaRevisionEn');
      expect(
        (await admin.agente.get(base + '/qr/cargas/' + key).expect(200)).body
          .archivo.estado,
      ).toBe('PENDIENTE');
      const d = await datos();
      d.metodos[0].qrId = id;
      await guardar(d).expect(422);
      await proveedor.materializar(proveedor.respuestaPerdida!);
      proveedor.contenidoIncorrecto = true;
      await vencer(id, 'proximaRevisionEn');
      await mantenimiento.conciliar(
        await prisma.archivoQrPago.findUniqueOrThrow({ where: { id } }),
      );
      expect(
        (await prisma.archivoQrPago.findUniqueOrThrow({ where: { id } }))
          .estado,
      ).toBe('PENDIENTE');
    });
    it('token antiguo no confirma la carga reclamada por otro proceso', async () => {
      proveedor.falloSubida = 'despues';
      const r = await subir().expect(202),
        a = await prisma.archivoQrPago.findUniqueOrThrow({
          where: { id: r.body.archivo.id as string },
        });
      await archivos.confirmar(
        a,
        randomUUID(),
        proveedor.recursos.get(a.publicId)!.datos,
      );
      expect(
        (await prisma.archivoQrPago.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('PENDIENTE');
    });
    it('conserva el QR de una publicación anterior y su instrucción al sustituirlo', async () => {
      const a = await archivo(),
        d = await datos();
      d.metodos[0].qrId = a.id;
      await guardar(d).expect(200);
      const m = await prisma.metodoPagoConfigurado.findFirstOrThrow({
        where: { archivoQrId: a.id },
      });
      const i = await prisma.instruccionPago.create({
        data: {
          metodoConfiguradoId: m.id,
          metodo: 'YAPE',
          claveSolicitud: randomUUID(),
          solicitudHash: 'a'.repeat(64),
          preparacionHash: 'b'.repeat(64),
          claveCreacionPedido: randomUUID(),
          usuarioId: cliente.id,
          importeReferencia: '100',
          respuesta: { destino: { qr: a.urlEntrega } },
        },
      });
      await guardar(await datos()).expect(200);
      expect(await mantenimiento.limpiar(await vencer(a.id))).toBe(false);
      expect(proveedor.recursos.has(a.publicId)).toBe(true);
      expect(
        (
          await prisma.instruccionPago.findUniqueOrThrow({
            where: { id: i.id },
          })
        ).metodoConfiguradoId,
      ).toBe(m.id);
    });
    it('solo limpia huérfanos confirmados después del plazo y permite reintentar borrado incierto', async () => {
      const a = await archivo();
      expect(await mantenimiento.limpiar(a)).toBe(false);
      proveedor.perderRespuestaBorrado = true;
      expect(await mantenimiento.limpiar(await vencer(a.id))).toBe(false);
      const b = await prisma.archivoQrPago.findUniqueOrThrow({
        where: { id: a.id },
      });
      expect(b.estado).toBe('ELIMINANDO');
      await prisma.archivoQrPago.update({
        where: { id: a.id },
        data: {
          bloqueoLimpiezaHasta: new Date(
            Math.max(Date.now() - 1, b.creadoEn.getTime() + 1),
          ),
        },
      });
      expect(
        await mantenimiento.limpiar(
          await prisma.archivoQrPago.findUniqueOrThrow({ where: { id: a.id } }),
        ),
      ).toBe(true);
      expect(
        (await prisma.archivoQrPago.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('ELIMINADO');
      const d = await datos();
      d.metodos[0].qrId = a.id;
      await guardar(d).expect(422);
    });
    it('limpieza que reclama primero impide publicar durante el borrado', async () => {
      const a = await vencer((await archivo()).id),
        entrada = puerta(),
        salida = puerta();
      proveedor.borradoEnEspera = async () => {
        entrada.abrir();
        await salida.promesa;
      };
      const limpieza = mantenimiento.limpiar(a);
      await entrada.promesa;
      try {
        const d = await datos();
        d.metodos[0].qrId = a.id;
        await guardar(d).expect(422);
      } finally {
        salida.abrir();
      }
      expect(await limpieza).toBe(true);
    });
    it('publicación que bloquea primero protege el QR frente a limpieza concurrente', async () => {
      const a = await vencer((await archivo()).id),
        d = await datos();
      d.metodos[0].qrId = a.id;
      const auth = await contexto(),
        escritura = app.get(EscrituraAutorizadaService),
        original = escritura.comprobarSesion.bind(escritura),
        entrada = puerta(),
        salida = puerta();
      let pausar = true;
      vi.spyOn(escritura, 'comprobarSesion').mockImplementation(
        async (tx, s, admin) => {
          if (pausar) {
            pausar = false;
            entrada.abrir();
            await salida.promesa;
          }
          return original(tx, s, admin);
        },
      );
      const publicacion = servicio.actualizar(d, auth);
      await entrada.promesa;
      const limpieza = mantenimiento.limpiar(a);
      salida.abrir();
      await publicacion;
      expect(await limpieza).toBe(false);
    });
    it('revocación durante espera de configuración impide publicar', async () => {
      const d = await datos(),
        s = await contexto(),
        entrada = puerta(),
        salida = puerta();
      const bloqueo = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM configuracion_pagos WHERE id=1 FOR UPDATE`;
          entrada.abrir();
          await salida.promesa;
        },
        { timeout: 20000 },
      );
      await entrada.promesa;
      const tarea = servicio.actualizar(d, s);
      await prisma.usuario.update({
        where: { id: admin.id },
        data: { rol: 'CLIENTE' },
      });
      salida.abrir();
      await bloqueo;
      await expect(tarea).rejects.toThrow('La sesión ya no autoriza');
      await prisma.usuario.update({
        where: { id: admin.id },
        data: { rol: 'ADMIN' },
      });
    });
    it('un fallo dentro de la publicación revierte métodos, versión y puntero', async () => {
      const n = await prisma.versionConfiguracionPagos.count(),
        d = await datos(),
        actual = await version();
      vi.spyOn(
        servicio as unknown as { respuesta: () => Promise<unknown> },
        'respuesta',
      ).mockRejectedValueOnce(Error('Fallo sintético'));
      await expect(servicio.actualizar(d, await contexto())).rejects.toThrow(
        'Fallo sintético',
      );
      expect(await prisma.versionConfiguracionPagos.count()).toBe(n);
      expect(await version()).toBe(actual);
    });
    it('conserva pago aprobado anterior y los siete distritos, sin publicaciones de Tienda', async () => {
      const p = await prisma.pedido.findUniqueOrThrow({
        where: { codigo: 'SOHO-COMERCIALANTERIOR' },
        include: { pago: true },
      });
      expect(p.pago).toMatchObject({
        estado: 'APROBADO',
        metodo: 'YAPE',
        instruccionId: null,
        version: 1,
      });
      expect(p.total.toFixed(2)).toBe('106.00');
      expect(await prisma.zonaEntrega.count()).toBe(7);
      expect(await prisma.versionConfiguracionTienda.count()).toBe(0);
    });
    it.each([
      base + '?otro=1',
      base + '?otro=1&otro=2',
      base + '/operaciones/no-uuid',
      base + '/qr/cargas/no-uuid',
    ])('rechaza consulta o identificador inválido %s', async (ruta) => {
      await admin.agente.get(ruta).expect(400);
    });
    it('carga confirmada se recupera aunque falle la configuración externa', async () => {
      const key = randomUUID(),
        r = await subir(key).expect(201);
      const spy = vi
        .spyOn(archivos.cloudinary, 'modoCarpetas')
        .mockRejectedValue(Error('Proveedor no disponible'));
      expect((await subir(key).expect(201)).body).toEqual(r.body);
      expect(spy).not.toHaveBeenCalled();
    });
    it('no comparte una carga cuya respuesta se confirma después de revocar al solicitante', async () => {
      const entrada = puerta(),
        salida = puerta(),
        c = await cuenta('ADMIN'),
        key = randomUUID();
      proveedor.subidaEnEspera = async () => {
        entrada.abrir();
        await salida.promesa;
      };
      const tarea = subir(key, 'YAPE', c).then((r) => r);
      await entrada.promesa;
      await prisma.sesion.updateMany({
        where: { usuarioId: c.id },
        data: { revocadaEn: new Date() },
      });
      salida.abrir();
      expect((await tarea).status).toBe(401);
      expect(
        (
          await prisma.archivoQrPago.findUniqueOrThrow({
            where: { claveCarga: key },
          })
        ).estado,
      ).toBe('DISPONIBLE');
      await otro.agente.get(base + '/qr/cargas/' + key).expect(404);
    });
    it('procesa huérfanos por lote y se detiene durante el cierre', async () => {
      const a = await vencer((await archivo()).id);
      await mantenimiento.procesarLote();
      expect(
        (await prisma.archivoQrPago.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('ELIMINADO');
      const m = new MantenimientoQrService(archivos, config);
      m.detener();
      expect(await m.procesarLote()).toEqual({
        conciliadas: 0,
        retiradas: 0,
        pendientes: 0,
        fallidas: 0,
      });
    });
  },
);
