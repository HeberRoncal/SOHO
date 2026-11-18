import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  Prisma,
  type EstadoPagoPedido,
} from '../src/generated/prisma/client.js';
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
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { ConsultaClientesService } from '../src/clientes/consulta-clientes.service.js';

const valor = process.env.TEST_CLIENTES_DATABASE_URL;
if (!valor)
  throw Error(
    'Clientes requiere TEST_CLIENTES_DATABASE_URL exclusiva, local y vacía con sufijo _test.',
  );
const url = new URL(obtenerUrlBaseDatos(valor));
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !url.pathname.endsWith('_test')
)
  throw Error('Clientes requiere MySQL local temporal con sufijo _test.');
const prisma = crearClientePrisma(valor),
  base = '/api/admin/clientes';
const fecha = (i: number) => new Date(Date.UTC(2026, 9, i + 1, 15));
const distritos = [
  'la-esperanza',
  'trujillo',
  'el-porvenir',
  'florencia-de-mora',
  'victor-larco',
  'huanchaco',
  'moche',
];
const pedidos: Array<{ id: string; codigo: string }> = [];
let app: INestApplication,
  privado: string,
  admin: ReturnType<typeof request.agent>,
  cliente: ReturnType<typeof request.agent>;
let principal: string,
  nuevo: string,
  inactivo: string,
  administrador: string,
  promovido: string,
  producto: string;
let invitado1: string,
  invitado2: string,
  codigoInvitado: string,
  variante: string;
const capacidades = { escrituraDisponible: false };

async function cuenta(
  nombres: string,
  rol: 'CLIENTE' | 'ADMIN' = 'CLIENTE',
  extra: Partial<Prisma.UsuarioUncheckedCreateInput> = {},
) {
  return prisma.usuario.create({
    data: {
      nombres,
      apellidos: 'Fernández',
      correo: randomUUID() + '@clientes.test',
      rol,
      ...extra,
    },
  });
}
async function acceso(id: string, clave: string) {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id } }),
    agente = request.agent(app.getHttpServer());
  const token = (await agente.get('/api/auth/csrf').expect(200)).body
    .csrfToken as string;
  await agente
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:4200')
    .set('X-CSRF-Token', token)
    .send({ correo: u.correo, clave })
    .expect(200);
  return agente;
}
async function pedido(
  usuarioId: string | null,
  i: number,
  estado: EstadoPagoPedido | null,
  total = '1.00',
) {
  return prisma.pedido.create({
    data: {
      codigo: 'SOHO-' + randomBytes(8).toString('hex').toUpperCase(),
      claveCreacion: randomUUID(),
      solicitudHash: 'a'.repeat(64),
      usuarioId,
      ...(!usuarioId
        ? {
            accesoInvitadoHash: randomBytes(32).toString('hex'),
            accesoInvitadoExpiraEn: new Date('2027-01-01T00:00:00Z'),
          }
        : {}),
      nombres: 'Contacto histórico',
      apellidos: 'Del Pedido',
      correo: 'coincidente@clientes.test',
      destinatario: 'Destinatario distinto',
      celular: i === 25 ? '955555555' : '987654321',
      distritoCodigo: i < 5 ? 'la-esperanza' : distritos[i % 7],
      distritoNombre:
        i < 5
          ? 'La Esperanza histórica'
          : 'Distrito histórico ' + distritos[i % 7],
      direccion:
        i <= 4
          ? i === 3
            ? 'av. histórica 123'
            : 'Av. Histórica 123'
          : `Av. Histórica ${i + 100}`,
      referencia: i === 4 ? 'Otra referencia' : '',
      subtotal: total,
      costoEnvio: '0.00',
      total,
      creadoEn: fecha(i),
      estadoEntrega:
        i === 1
          ? 'CANCELADO'
          : estado === 'APROBADO'
            ? 'CONFIRMADO'
            : 'PENDIENTE',
      ...(estado ? { pago: { create: { metodo: 'YAPE', estado } } } : {}),
    },
  });
}
const get = (ruta: string) => admin.get(ruta).expect(200);
async function detalle(id = principal) {
  return (await get(base + '/' + id)).body.cliente;
}

describe.sequential(
  'Clientes: consultas ADMIN con HTTP y MySQL temporal',
  () => {
    beforeAll(async () => {
      if ((await prisma.usuario.count()) || (await prisma.pedido.count()))
        throw Error('La base de Clientes debe estar vacía.');
      privado = await mkdtemp(path.join(tmpdir(), 'soho-clientes-test-'));
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
      const clave = 'Clave sintética Clientes 2026',
        claveHash = await new ClavesService().crear(clave);
      administrador = (await cuenta('Administrador', 'ADMIN', { claveHash }))
        .id;
      principal = (
        await cuenta('Lucía', 'CLIENTE', {
          correo: 'coincidente@clientes.test',
          correoVerificadoEn: fecha(0),
          claveHash,
        })
      ).id;
      nuevo = (await cuenta('Cuenta nueva')).id;
      inactivo = (await cuenta('Cuenta inactiva', 'CLIENTE', { activo: false }))
        .id;
      promovido = (await cuenta('Comprador promovido')).id;
      for (let i = 0; i < 24; i++) await cuenta('Empate');
      admin = await acceso(administrador, clave);
      cliente = await acceso(principal, clave);
      const estados: Array<EstadoPagoPedido | null> = [
        'APROBADO',
        'APROBADO',
        'PENDIENTE',
        'OBSERVADO',
        'RECHAZADO',
        'ANULADO',
        null,
      ];
      for (let i = 0; i < 26; i++)
        pedidos.push(
          await pedido(
            principal,
            i,
            i < 7 ? estados[i] : 'APROBADO',
            i === 0 ? '0.10' : i === 1 ? '0.20' : i === 2 ? '0.30' : '1.00',
          ),
        );
      await pedido(promovido, 12, 'PENDIENTE');
      await prisma.usuario.update({
        where: { id: promovido },
        data: { rol: 'ADMIN' },
      });
      const g1 = await pedido(null, 24, 'APROBADO'),
        g2 = await pedido(null, 24, 'PENDIENTE');
      invitado1 = 'invitado:' + g1.id;
      invitado2 = 'invitado:' + g2.id;
      codigoInvitado = g1.codigo;
      const p = await prisma.producto.create({
        data: {
          codigoInterno: 'CLI-PRUEBA',
          slug: 'clientes-historico',
          nombre: 'Producto actual',
          estado: 'ARCHIVADO',
        },
      });
      producto = p.id;
      const t = await prisma.talla.create({ data: { valor: '40.5' } });
      const color = await prisma.productoColor.create({
        data: {
          productoId: p.id,
          codigo: 'BL',
          nombre: 'Blanco',
          hexadecimal: '#FFFFFF',
          variantes: { create: { tallaId: t.id, sku: 'CLI-TEST-BL-40P5' } },
        },
        include: { variantes: true },
      });
      variante = color.variantes[0].id;
      await prisma.pedidoArticulo.create({
        data: {
          pedidoId: pedidos[0].id,
          varianteId: variante,
          orden: 0,
          sku: 'SKU-HISTORICO',
          nombreProducto: 'Nombre histórico de compra',
          color: 'Blanco histórico',
          talla: '40.5',
          imagen: '/foto-historica.png',
          cantidad: 1,
          precioUnitario: '0.10',
          importeBruto: '0.10',
          importeNeto: '0.10',
        },
      });
      await prisma.direccionUsuario.create({
        data: {
          usuarioId: principal,
          etiqueta: 'Agenda privada',
          destinatario: 'Agenda privada',
          celular: '911111111',
          distrito: 'moche',
          direccion: 'Dirección privada que no se compró',
          referencia: '',
          predeterminada: true,
        },
      });
    });
    afterAll(async () => {
      await app?.close();
      await prisma.$disconnect();
      if (privado) {
        const root = await realpath(tmpdir()),
          target = await realpath(privado);
        if (
          path.dirname(target) !== root ||
          !path.basename(target).startsWith('soho-clientes-test-')
        )
          throw Error('Directorio temporal no permitido');
        await rm(target, { recursive: true, force: true });
      }
    });

    it.each(['', '/cuenta', '/cuenta/pedidos', '/cuenta/direcciones'])(
      'protege cada ruta frente a invitados y CLIENTE: %s',
      async (ruta) => {
        await request(app.getHttpServer())
          .get(base + ruta.replace('cuenta', principal))
          .expect(401);
        await cliente.get(base + ruta.replace('cuenta', principal)).expect(403);
      },
    );
    it('lista registrados e invitados sin depender de páginas de Pedidos y sin caché HTTP', async () => {
      const r = await get(base);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.resumen).toEqual({
        total: 30,
        registrados: 28,
        invitados: 2,
        unidadInvitados: 'pedido',
      });
      expect(r.body.paginacion).toEqual({
        pagina: 1,
        limite: 20,
        total: 30,
        paginas: 2,
      });
      expect(r.body.clientes).toHaveLength(20);
      expect(r.body.capacidades).toEqual(capacidades);
      expect(r.body.clientes[0].identificador).toBe(principal);
      expect(r.body.clientes[0]).toMatchObject({
        pedidosTotal: 26,
        telefonoEntrega: {
          celular: '955555555',
          destinatario: 'Destinatario distinto',
          pedidoCodigo: pedidos[25].codigo,
        },
      });
    });
    it('incluye cuentas sin compra, inactivas y compradores ADMIN, excluyendo ADMIN sin compras', async () => {
      const r = (await get(base + '?limite=50')).body.clientes;
      expect(r.map((x: { identificador: string }) => x.identificador)).toEqual(
        expect.arrayContaining([principal, nuevo, inactivo, promovido]),
      );
      expect(
        r.some(
          (x: { identificador: string }) => x.identificador === administrador,
        ),
      ).toBe(false);
      await admin.get(base + '/' + administrador).expect(404);
      expect((await detalle(inactivo)).cuenta.activa).toBe(false);
    });
    it('cuenta sin compras conserva ceros y ausencias, sin recurrir a demostración', async () => {
      const d = await detalle(nuevo);
      expect(d.telefonoEntrega).toBeNull();
      expect(d.ultimoPedido).toBeNull();
      expect(d.resumen).toEqual({
        pedidosTotal: 0,
        direccionesTotal: 0,
        primerPedido: null,
        ultimoPedido: null,
        pagosAprobados: '0.00',
        moneda: 'PEN',
      });
      for (const sub of ['pedidos', 'direcciones']) {
        const r = (await get(base + '/' + nuevo + '/' + sub)).body;
        expect(r[sub]).toEqual([]);
        expect(r.paginacion.total).toBe(0);
      }
    });
    it('separa dos compras invitadas y cuenta con el mismo correo y celular', async () => {
      const r = (
        await get(base + '?busqueda=coincidente%40clientes.test&limite=50')
      ).body;
      expect(r.paginacion.total).toBe(3);
      expect(
        new Set(
          r.clientes.map((x: { identificador: string }) => x.identificador),
        ),
      ).toEqual(new Set([principal, invitado1, invitado2]));
      for (const id of [invitado1, invitado2]) {
        const d = await detalle(id);
        expect(d.cuenta).toBeNull();
        expect(d.resumen.pedidosTotal).toBe(1);
        expect(
          (await get(base + '/' + id + '/pedidos')).body.pedidos,
        ).toHaveLength(1);
      }
      await admin.get(base + '/invitado:coincidente@clientes.test').expect(400);
      await admin.get(base + '/invitado:' + pedidos[0].id).expect(404);
    });
    it('resumen global se conserva frente al tipo, búsqueda y página vacía', async () => {
      const r = (await get(base + '?tipo=invitado&busqueda=ausente&pagina=99'))
        .body;
      expect(r.clientes).toEqual([]);
      expect(r.paginacion.total).toBe(0);
      expect(r.resumen.total).toBe(30);
      const ultima = (await get(base + '?pagina=100000')).body;
      expect(ultima.clientes).toEqual([]);
      expect(ultima.paginacion.total).toBe(30);
    });
    it.each([
      ['lucia fernandez', 1],
      ['LUCÍA', 1],
      ['955-555-555', 1],
      ['(955) 555.555', 1],
      ['911111111', 0],
      ['++++', 0],
      ["%' OR 1=1 --", 0],
    ])(
      'búsqueda parametrizada %s devuelve %i fichas',
      async (busqueda, total) => {
        expect(
          (await get(base + '?busqueda=' + encodeURIComponent(busqueda))).body
            .paginacion.total,
        ).toBe(total);
      },
    );
    it('comodines y barra inversa se buscan literalmente', async () => {
      await prisma.usuario.update({
        where: { id: nuevo },
        data: { nombres: 'Nombre 100%_\\ especial' },
      });
      try {
        for (const q of ['%', '_', '\\'])
          expect(
            (await get(base + '?busqueda=' + encodeURIComponent(q))).body
              .paginacion.total,
          ).toBe(1);
      } finally {
        await prisma.usuario.update({
          where: { id: nuevo },
          data: { nombres: 'Cuenta nueva' },
        });
      }
    });
    it.each(['recientes', 'nombre', 'pedidos'])(
      'paginación y empates sin duplicados con orden %s',
      async (orden) => {
        const a = (await get(base + '?orden=' + orden + '&limite=17')).body
          .clientes;
        const b = (await get(base + '?orden=' + orden + '&limite=17&pagina=2'))
          .body.clientes;
        expect(
          new Set(
            [...a, ...b].map((x: { identificador: string }) => x.identificador),
          ).size,
        ).toBe(30);
        expect(
          (await get(base + '?orden=' + orden + '&limite=17')).body.clientes,
        ).toEqual(a);
        if (orden !== 'nombre') expect(a[0].identificador).toBe(principal);
      },
    );
    it('agregados abarcan todas las páginas y cuentan pagos aprobados una vez, incluido cancelado', async () => {
      const d = await detalle();
      expect(d.nombre).toBe('Lucía Fernández');
      expect(d.cuenta.correoVerificado).toBe(true);
      expect(d.resumen).toMatchObject({
        pedidosTotal: 26,
        pagosAprobados: '19.30',
        direccionesTotal: 24,
        primerPedido: { codigo: pedidos[0].codigo },
        ultimoPedido: { codigo: pedidos[25].codigo },
      });
      const g = (await detalle(invitado1)).resumen;
      expect(g.pagosAprobados).toBe('1.00');
    });
    it('lecturas reflejan aprobación/cancelación posterior sin reescribir pedidos ni sumas decimales', async () => {
      const donde = { pedidoId: pedidos[2].id };
      await prisma.pagoPedido.update({
        where: donde,
        data: { estado: 'APROBADO' },
      });
      try {
        expect((await detalle()).resumen.pagosAprobados).toBe('19.60');
        await prisma.pedido.update({
          where: { id: pedidos[2].id },
          data: { estadoEntrega: 'CANCELADO' },
        });
        expect((await detalle()).resumen.pagosAprobados).toBe('19.60');
      } finally {
        await prisma.pagoPedido.update({
          where: donde,
          data: { estado: 'PENDIENTE' },
        });
        await prisma.pedido.update({
          where: { id: pedidos[2].id },
          data: { estadoEntrega: 'PENDIENTE' },
        });
      }
    });
    it('historial pagina por creación y conserva artículos y contacto históricos', async () => {
      await prisma.usuario.update({
        where: { id: principal },
        data: { nombres: 'Nombre actual' },
      });
      try {
        expect((await detalle()).nombre).toBe('Nombre actual Fernández');
        const r = (await get(base + '/' + principal + '/pedidos?pagina=2'))
          .body;
        expect(r.paginacion.total).toBe(26);
        expect(r.pedidos).toHaveLength(6);
        const primero = r.pedidos.at(-1);
        expect(primero.codigo).toBe(pedidos[0].codigo);
        expect(primero.contacto.nombres).toBe('Contacto histórico');
        expect(primero.articulos[0]).toMatchObject({
          sku: 'SKU-HISTORICO',
          nombre: 'Nombre histórico de compra',
          talla: '40.5',
          imagen: '/foto-historica.png',
        });
        expect(
          r.pedidos.find(
            (p: { codigo: string }) => p.codigo === pedidos[1].codigo,
          ),
        ).toMatchObject({
          estadoEntrega: 'CANCELADO',
          estadoPago: 'APROBADO',
          total: '0.20',
        });
        expect(
          (await get(base + '/' + principal + '/pedidos?pagina=999')).body
            .paginacion.total,
        ).toBe(26);
      } finally {
        await prisma.usuario.update({
          where: { id: principal },
          data: { nombres: 'Lucía' },
        });
      }
    });
    it('direcciones son snapshots exactos, paginados, sin agenda ni cotización vigente', async () => {
      const a = (await get(base + '/' + principal + '/direcciones')).body,
        b = (await get(base + '/' + principal + '/direcciones?pagina=2')).body;
      expect(a.paginacion.total).toBe(24);
      expect(a.direcciones).toHaveLength(20);
      expect(b.direcciones).toHaveLength(4);
      const todas = [...a.direcciones, ...b.direcciones];
      expect(todas.reduce((n, d) => n + d.pedidosTotal, 0)).toBe(26);
      expect(todas.some((d) => d.direccion === 'av. histórica 123')).toBe(true);
      expect(
        todas.find(
          (d) =>
            d.direccion === 'Av. Histórica 123' &&
            d.distritoCodigo === 'la-esperanza' &&
            !d.referencia,
        ).pedidosTotal,
      ).toBe(3);
      expect(new Set(todas.map((d) => d.distritoCodigo))).toEqual(
        new Set(distritos),
      );
      expect(JSON.stringify(todas)).not.toMatch(
        /Agenda privada|Dirección privada/,
      );
    });
    it('proyección administrativa de Pedidos/Pagos usa el UUID invitado, sin modificar permisos', async () => {
      for (const zona of ['pedidos', 'pagos']) {
        const r = (
          await admin
            .get('/api/admin/' + zona + '/' + codigoInvitado)
            .expect(200)
        ).body.pedido;
        expect(r.clienteId).toBe(invitado1);
        expect(r.clienteId).not.toContain('@');
      }
      await request(app.getHttpServer())
        .get('/api/pedidos/' + codigoInvitado)
        .expect(401);
    });
    it.each([
      '?tipo=otro',
      '?vista=normal',
      '?pagina=0',
      '?limite=51',
      '?pagina=1&pagina=2',
      '?busqueda=a&busqueda=b',
      '?busqueda[x]=a',
    ])('rechaza contrato inválido por HTTP %s', async (q) => {
      await admin.get(base + q).expect(400);
    });
    it('valida parámetros y devuelve 404 sin tomar otra identidad', async () => {
      await admin.get(base + '/' + nuevo + '?pagina=1').expect(400);
      await admin
        .get(base + '/' + principal + '/pedidos?estado=APROBADO')
        .expect(400);
      for (const sub of ['', '/pedidos', '/direcciones'])
        await admin.get(base + '/' + randomUUID() + sub).expect(404);
    });
    it('devuelve 503 seguro y recuperable ante fallo de persistencia', async () => {
      const servicio = app.get(ConsultaClientesService),
        metodo = vi.spyOn(servicio, 'listar').mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('SELECT secreto', {
            code: 'P2010',
            clientVersion: 'test',
          }),
        );
      try {
        const r = await admin.get(base).expect(503);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(r.body)).not.toMatch(/SELECT|secreto|P2010/);
      } finally {
        metodo.mockRestore();
      }
      await get(base);
    });
    it('respuestas no exponen autenticación, comprobantes ni datos de otros módulos', async () => {
      for (const ruta of [
        base,
        base + '/' + principal,
        base + '/' + principal + '/pedidos',
        base + '/' + principal + '/direcciones',
      ]) {
        const r = await get(ruta);
        expect(JSON.stringify(r.body)).not.toMatch(
          /claveHash|clave_hash|accesoInvitado|solicitudHash|comprobantes|numeroDocumento|sesiones|identidadesExternas/,
        );
      }
      expect(
        await prisma.producto.findUnique({
          where: { id: producto },
          select: { estado: true },
        }),
      ).toEqual({ estado: 'ARCHIVADO' });
    });
    it('las cuatro consultas conservan exactamente diez tablas de negocio', async () => {
      const instantanea = async () =>
        JSON.stringify(
          await prisma.$transaction(async (tx) => ({
            usuarios: await tx.usuario.findMany({ orderBy: { id: 'asc' } }),
            pedidos: await tx.pedido.findMany({ orderBy: { id: 'asc' } }),
            articulos: await tx.pedidoArticulo.findMany({
              orderBy: { id: 'asc' },
            }),
            pagos: await tx.pagoPedido.findMany({ orderBy: { id: 'asc' } }),
            direcciones: await tx.direccionUsuario.findMany({
              orderBy: { id: 'asc' },
            }),
            cobertura: await tx.zonaEntrega.findMany({
              orderBy: { id: 'asc' },
            }),
            productos: await tx.producto.findMany({ orderBy: { id: 'asc' } }),
            variantes: await tx.variante.findMany({ orderBy: { id: 'asc' } }),
            reservas: await tx.reservaInventario.findMany({
              orderBy: { id: 'asc' },
            }),
            movimientos: await tx.movimientoInventario.findMany({
              orderBy: { id: 'asc' },
            }),
          })),
        );
      const antes = await instantanea();
      for (const ruta of [
        base,
        base + '/' + principal,
        base + '/' + principal + '/pedidos',
        base + '/' + principal + '/direcciones',
      ])
        await get(ruta);
      expect(await instantanea()).toBe(antes);
    });

    it('revocar ADMIN o cerrar sesión impide seguir consultando datos', async () => {
      await prisma.usuario.update({
        where: { id: administrador },
        data: { rol: 'CLIENTE' },
      });
      try {
        await admin.get(base).expect(403);
      } finally {
        await prisma.usuario.update({
          where: { id: administrador },
          data: { rol: 'ADMIN' },
        });
      }
      await prisma.sesion.deleteMany({ where: { usuarioId: administrador } });
      const r = await admin.get(base).expect(401);
      expect(r.headers['cache-control']).toBe('no-store');
    });
  },
);
