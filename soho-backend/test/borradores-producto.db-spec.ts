import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import { EscrituraAutorizadaService } from '../src/autenticacion/seguridad/escritura-autorizada.service.js';
import type { ContextoAuth } from '../src/autenticacion/sesiones/contexto-auth.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { sembrarCatalogo } from '../prisma/sembrar-catalogo.js';
import { LecturaCatalogo } from '../src/productos/migracion/lectura-catalogo.js';
import { PlanCorrespondenciaProductos } from '../src/productos/migracion/plan-correspondencia-productos/plan-correspondencia-productos.js';
import { ConvertirCatalogo } from '../src/productos/migracion/convertir-catalogo.js';
import { BorradoresProductoService } from '../src/productos/borradores/borradores-producto.service.js';

const url = process.env.TEST_BORRADORES_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Borradores requiere TEST_BORRADORES_DATABASE_URL exclusiva, migrada y vacía con sufijo _test.',
  );
const prisma = crearClientePrisma(url),
  config = crearConfiguracionAuth({});
const origen = 'http://localhost:4200',
  clave = 'Clave sintética borradores 2026';
let app: INestApplication,
  marcaId: string,
  categoriaId: string,
  grupoId: string,
  perderClave: string | undefined;
let serie = 0;
type Acceso = {
  cliente: ReturnType<typeof request.agent>;
  csrf: string;
  usuarioId: string;
};
let admin: Acceso, otro: Acceso, cliente: Acceso;
async function acceso(rol: 'ADMIN' | 'CLIENTE'): Promise<Acceso> {
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Borradores',
      correo: randomUUID() + '@borradores.test',
      rol,
      claveHash: await new ClavesService().crear(clave),
    },
  });
  const agente = request.agent(app.getHttpServer());
  const csrf = (await agente.get('/api/auth/csrf').expect(200)).body
    .csrfToken as string;
  const login = await agente
    .post('/api/auth/login')
    .set('Origin', origen)
    .set('X-CSRF-Token', csrf)
    .send({ correo: u.correo, clave })
    .expect(200);
  return {
    cliente: agente,
    csrf: login.body.csrfToken as string,
    usuarioId: u.id,
  };
}
function nuevo(extra: Record<string, unknown> = {}) {
  serie++;
  return {
    claveSolicitud: randomUUID(),
    nombre: 'Producto sintético ' + serie,
    grupoModelo: {
      marcaId,
      codigoModelo: 'PRUEBA' + serie,
      modelo: 'Modelo sintético ' + serie,
    },
    color: { codigo: 'BL', nombre: 'Blanco', hexadecimal: '#FFFFFF' },
    categoriaId,
    precio: '100.00',
    tallas: ['40', '40.5'],
    ...extra,
  };
}
function crear(body: object, cuenta = admin) {
  return cuenta.cliente
    .post('/api/admin/productos')
    .set('Origin', origen)
    .set('X-CSRF-Token', cuenta.csrf)
    .send(body);
}
function editar(id: string, body: object, cuenta = admin) {
  return cuenta.cliente
    .patch('/api/admin/productos/' + id + '/borrador')
    .set('Origin', origen)
    .set('X-CSRF-Token', cuenta.csrf)
    .send(body);
}
const contador = async () =>
  (await prisma.secuenciaCodigoProducto.findUniqueOrThrow({ where: { id: 1 } }))
    .ultimoNumero;
async function contexto(cuenta: Acceso): Promise<ContextoAuth> {
  const sesion = await prisma.sesion.findFirstOrThrow({
    where: { usuarioId: cuenta.usuarioId, revocadaEn: null },
  });
  return {
    sesionId: sesion.id,
    usuario: {
      id: cuenta.usuarioId,
      nombres: 'Ana',
      apellidos: 'Borradores',
      correo: 'sintetico@borradores.test',
      rol: 'ADMIN',
      correoVerificado: false,
    },
  };
}
describe.sequential('Borradores con HTTP y MySQL exclusivo', () => {
  beforeAll(async () => {
    const tablas = await prisma.$queryRaw<
      Array<{ nombre: string }>
    >`SELECT TABLE_NAME AS nombre FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME NOT IN ('_prisma_migrations','conversion_catalogo','zonas_entrega','configuracion_reserva','configuracion_pagos','configuracion_tienda')`;
    for (const { nombre } of tablas) {
      expect(nombre).toMatch(/^[a-z_]+$/);
      const [fila] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        'SELECT COUNT(*) AS n FROM `' + nombre + '`',
      );
      expect(
        Number(fila.n),
        'La base exclusiva debe comenzar vacía: ' + nombre,
      ).toBe(0);
    }
    expect(
      (await prisma.conversionCatalogo.findUniqueOrThrow({ where: { id: 1 } }))
        .realizadaEn,
    ).toBeNull();
    await sembrarCatalogo(prisma);
    await new ConvertirCatalogo().aplicar(
      prisma,
      new PlanCorrespondenciaProductos().crear(
        await new LecturaCatalogo().leer(prisma),
      ),
    );
    marcaId = (
      await prisma.marca.findUniqueOrThrow({ where: { codigo: 'NK' } })
    ).id;
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    grupoId = (
      await prisma.grupoModelo.findFirstOrThrow({
        where: { marcaId, codigoModelo: 'AF107' },
      })
    ).id;
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(config)
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: vi.fn() })
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
            req.method === 'POST' &&
            req.path === '/api/admin/productos' &&
            req.body?.claveSolicitud === perderClave &&
            res.statusCode === 201
          ) {
            perderClave = undefined;
            res.destroy();
            return res;
          }
          return json(body);
        };
        next();
      },
    );
    await app.init();
    admin = await acceso('ADMIN');
    otro = await acceso('ADMIN');
    cliente = await acceso('CLIENTE');
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('guarda un borrador mínimo, asigna código y auditoría sin publicar', async () => {
    const antes = await contador(),
      body = { claveSolicitud: randomUUID(), nombre: 'Solo nombre' };
    const { body: r } = await crear(body).expect(201);
    expect(r.producto).toMatchObject({
      estado: 'borrador',
      precio: null,
      grupoModelo: null,
      version: 1,
      variantes: [],
      codigoInterno: 'SHO-' + String(antes + 1).padStart(4, '0'),
    });
    expect(await contador()).toBe(antes + 1);
    expect(
      await prisma.operacionProducto.findUniqueOrThrow({
        where: { claveSolicitud: body.claveSolicitud },
      }),
    ).toMatchObject({
      usuarioResponsableId: admin.usuarioId,
      versionAnterior: null,
      versionPosterior: 1,
      tipo: 'CREAR',
      antes: null,
    });
    await request(app.getHttpServer())
      .get('/api/productos/' + r.producto.slug)
      .expect(404);
  });
  it('genera SKU de talla entera y media talla con inventario cero', async () => {
    const body = nuevo(),
      movimientos = await prisma.movimientoInventario.count();
    const { body: r } = await crear(body).expect(201);
    expect(r.producto.variantes.map((v: { sku: string }) => v.sku)).toEqual([
      'NK-' + body.grupoModelo.codigoModelo + '-BL-40',
      'NK-' + body.grupoModelo.codigoModelo + '-BL-40P5',
    ]);
    expect(r.producto.inventario).toMatchObject({
      fisico: 0,
      reservado: 0,
      disponible: 0,
    });
    expect(await prisma.movimientoInventario.count()).toBe(movimientos);
    const p = await prisma.producto.findUniqueOrThrow({
      where: { id: r.producto.id },
      include: { colores: true, variantesDirectas: true },
    });
    expect(p.creadoPorId).toBe(admin.usuarioId);
    expect(p.colores).toHaveLength(1);
    expect(
      p.variantesDirectas.every(
        (v) => v.productoColorId === p.colores[0].id && v.productoId === p.id,
      ),
    ).toBe(true);
  });
  it('completa después un borrador sin grupo y permite precio pendiente', async () => {
    const { body: r } = await crear({
      claveSolicitud: randomUUID(),
      nombre: 'Pendiente',
    }).expect(201);
    const body = nuevo();
    const { body: e } = await editar(r.producto.id, {
      ...body,
      version: 1,
      precio: null,
    }).expect(200);
    expect(e.producto).toMatchObject({
      id: r.producto.id,
      codigoInterno: r.producto.codigoInterno,
      slug: r.producto.slug,
      version: 2,
      precio: null,
    });
    expect(e.producto.variantes).toHaveLength(2);
  });
  it('añade otro color a un grupo existente sin duplicarlo', async () => {
    const grupos = await prisma.grupoModelo.count();
    const body = nuevo({
      grupoModelo: { id: grupoId, version: 1 },
      color: { codigo: 'RO', nombre: 'Rojo', hexadecimal: '#FF0000' },
    });
    const { body: r } = await crear(body).expect(201);
    expect(r.producto.variantes[1].sku).toBe('NK-AF107-RO-40P5');
    expect(await prisma.grupoModelo.count()).toBe(grupos);
    expect(r.producto.grupoModelo.id).toBe(grupoId);
  });
  it('conserva SKU, código, slug y stock al corregir etiquetas y añadir tallas', async () => {
    const { body: r } = await crear(nuevo()).expect(201);
    await prisma.variante.update({
      where: { id: r.producto.variantes[0].id },
      data: { existencias: 1, cantidadReservada: 3, habilitada: false },
    });
    const antes = await prisma.variante.findMany({
      where: { productoId: r.producto.id },
      orderBy: { id: 'asc' },
    });
    const { body: e } = await editar(r.producto.id, {
      claveSolicitud: randomUUID(),
      version: 1,
      nombre: 'Nombre corregido',
      color: { codigo: 'BL', nombre: 'Blanco hueso', hexadecimal: '#FFFEEE' },
      tallas: ['40', '41'],
    }).expect(200);
    expect(e.producto).toMatchObject({
      codigoInterno: r.producto.codigoInterno,
      slug: r.producto.slug,
      version: 2,
      nombre: 'Nombre corregido',
    });
    const despues = await prisma.variante.findMany({
      where: { id: { in: antes.map((v) => v.id) } },
      orderBy: { id: 'asc' },
    });
    expect(despues).toEqual(antes);
    expect(e.producto.variantes).toHaveLength(3);
    expect(
      (
        await prisma.productoColor.findFirstOrThrow({
          where: { productoId: r.producto.id },
        })
      ).nombre,
    ).toBe('Blanco hueso');
  });
  it('repite un alta confirmada sin resetear datos editados ni consumir otro código', async () => {
    const body = nuevo(),
      { body: r } = await crear(body).expect(201);
    await editar(r.producto.id, {
      claveSolicitud: randomUUID(),
      version: 1,
      nombre: 'Después del alta',
    }).expect(200);
    const n = await contador();
    const repetida = await crear(body).expect(201);
    expect(repetida.body).toEqual(r);
    expect(await contador()).toBe(n);
    expect(
      (
        await prisma.producto.findUniqueOrThrow({
          where: { id: r.producto.id },
        })
      ).nombre,
    ).toBe('Después del alta');
  });
  it('recupera un COMMIT sin respuesta por la clave de operación y el mismo POST', async () => {
    const body = nuevo(),
      n = await contador();
    perderClave = body.claveSolicitud;
    await expect(crear(body)).rejects.toThrow();
    const recuperada = await admin.cliente
      .get('/api/admin/productos/operaciones/' + body.claveSolicitud)
      .expect(200);
    const repetida = await crear(body).expect(201);
    expect(repetida.body).toEqual(recuperada.body);
    expect(await contador()).toBe(n + 1);
    expect(
      await prisma.operacionProducto.count({
        where: { claveSolicitud: body.claveSolicitud },
      }),
    ).toBe(1);
  });
  it('no comparte resultados por clave entre administradores ni acepta otro contenido', async () => {
    const body = nuevo();
    await crear(body).expect(201);
    await crear({ ...body, nombre: 'Diferente' }).expect(409);
    await crear(body, otro).expect(409);
    await otro.cliente
      .get('/api/admin/productos/operaciones/' + body.claveSolicitud)
      .expect(404);
  });
  it('serializa dos altas con la misma clave', async () => {
    const body = nuevo(),
      n = await contador();
    const [a, b] = await Promise.all([crear(body), crear(body)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body).toEqual(b.body);
    expect(await contador()).toBe(n + 1);
  });
  it('asigna códigos distintos en altas concurrentes de administradores distintos', async () => {
    const n = await contador();
    const [a, b] = await Promise.all([crear(nuevo()), crear(nuevo(), otro)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.producto.codigoInterno).not.toBe(
      b.body.producto.codigoInterno,
    );
    expect(await contador()).toBe(n + 2);
  });
  it('resuelve dos ediciones concurrentes con versión y sin perder el primer guardado', async () => {
    const { body: r } = await crear(nuevo()).expect(201);
    const [a, b] = await Promise.all([
      editar(r.producto.id, {
        claveSolicitud: randomUUID(),
        version: 1,
        nombre: 'Administrador uno',
      }),
      editar(
        r.producto.id,
        {
          claveSolicitud: randomUUID(),
          version: 1,
          nombre: 'Administrador dos',
        },
        otro,
      ),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
    expect(
      (
        await prisma.producto.findUniqueOrThrow({
          where: { id: r.producto.id },
        })
      ).version,
    ).toBe(2);
    expect(
      await prisma.operacionProducto.count({
        where: { productoId: r.producto.id, tipo: 'ACTUALIZAR' },
      }),
    ).toBe(1);
  });
  it('repite una edición después de otra posterior sin volver a aplicarla', async () => {
    const { body: r } = await crear(nuevo()).expect(201),
      body = {
        claveSolicitud: randomUUID(),
        version: 1,
        nombre: 'Primera corrección',
      };
    const primera = await editar(r.producto.id, body).expect(200);
    await editar(r.producto.id, {
      claveSolicitud: randomUUID(),
      version: 2,
      nombre: 'Corrección posterior',
    }).expect(200);
    expect((await editar(r.producto.id, body).expect(200)).body).toEqual(
      primera.body,
    );
    expect(
      (
        await prisma.producto.findUniqueOrThrow({
          where: { id: r.producto.id },
        })
      ).nombre,
    ).toBe('Corrección posterior');
  });
  it('rechaza grupo o código de color diferente cuando existen variantes', async () => {
    const { body: r } = await crear(nuevo()).expect(201),
      grupos = await prisma.grupoModelo.count();
    await editar(r.producto.id, {
      claveSolicitud: randomUUID(),
      version: 1,
      color: { codigo: 'NG', nombre: 'Negro', hexadecimal: '#000000' },
    }).expect(409);
    await editar(r.producto.id, {
      claveSolicitud: randomUUID(),
      version: 1,
      grupoModelo: { marcaId, codigoModelo: 'OTRO', modelo: 'Otro modelo' },
    }).expect(409);
    expect(await prisma.grupoModelo.count()).toBe(grupos);
    expect(
      (
        await prisma.producto.findUniqueOrThrow({
          where: { id: r.producto.id },
        })
      ).version,
    ).toBe(1);
  });
  it('rechaza color repetido, grupo duplicado y versión de grupo obsoleta con rollback', async () => {
    const n = await contador(),
      grupos = await prisma.grupoModelo.count();
    await crear(nuevo({ grupoModelo: { id: grupoId, version: 1 } })).expect(
      409,
    );
    await crear(
      nuevo({
        grupoModelo: {
          marcaId,
          codigoModelo: 'AF107',
          modelo: 'Nombre distinto',
        },
      }),
    ).expect(409);
    await crear(
      nuevo({
        grupoModelo: { id: grupoId, version: 2 },
        color: { codigo: 'AZ', nombre: 'Azul', hexadecimal: '#0000FF' },
      }),
    ).expect(409);
    expect(await contador()).toBe(n);
    expect(await prisma.grupoModelo.count()).toBe(grupos);
  });
  it('rechaza campos protegidos, precio incoherente y tallas sin identidad', async () => {
    const n = await contador();
    await crear({ ...nuevo(), existencias: 99 }).expect(400);
    await crear(nuevo({ precioAnterior: '90.00' })).expect(400);
    await crear({
      claveSolicitud: randomUUID(),
      nombre: 'Sin identidad',
      tallas: ['40'],
    }).expect(422);
    expect(await contador()).toBe(n);
  });
  it('no permite editar productos publicados ni archivados', async () => {
    const publicado = await prisma.producto.findFirstOrThrow({
      where: { estado: 'PUBLICADO' },
    });
    await editar(publicado.id, {
      claveSolicitud: randomUUID(),
      version: publicado.version,
      nombre: 'Cambio indebido',
    }).expect(409);
    const { body: r } = await crear(nuevo()).expect(201);
    await prisma.producto.update({
      where: { id: r.producto.id },
      data: { estado: 'ARCHIVADO' },
    });
    await editar(r.producto.id, {
      claveSolicitud: randomUUID(),
      version: 1,
      nombre: 'No',
    }).expect(409);
  });
  it('protege las rutas con sesión, ADMIN y CSRF', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/productos')
      .send(nuevo())
      .expect(401);
    await crear(nuevo(), cliente).expect(403);
    await admin.cliente
      .post('/api/admin/productos')
      .set('Origin', origen)
      .send(nuevo())
      .expect(403);
  });
  it('revierte producto, grupo, variantes y contador si falla la auditoría final', async () => {
    const n = await contador(),
      productos = await prisma.producto.count(),
      grupos = await prisma.grupoModelo.count(),
      variantes = await prisma.variante.count();
    const extendido = prisma.$extends({
      query: {
        operacionProducto: {
          create() {
            throw Error('Fallo sintético de auditoría');
          },
        },
      },
    }) as unknown as PrismaService;
    const service = new BorradoresProductoService(
      extendido,
      new EscrituraAutorizadaService(extendido, config),
    );
    await expect(service.crear(nuevo(), await contexto(admin))).rejects.toThrow(
      'Fallo sintético de auditoría',
    );
    expect(await contador()).toBe(n);
    expect(await prisma.producto.count()).toBe(productos);
    expect(await prisma.grupoModelo.count()).toBe(grupos);
    expect(await prisma.variante.count()).toBe(variantes);
  });
  it('comprueba de nuevo la sesión después de esperar el bloqueo del producto', async () => {
    const cuenta = await acceso('ADMIN'),
      { body: r } = await crear(nuevo()).expect(201);
    let abrir!: () => void, listo!: () => void;
    const espera = new Promise<void>((resolve) => (abrir = resolve)),
      adquirido = new Promise<void>((resolve) => (listo = resolve));
    const bloqueo = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM productos WHERE id=${r.producto.id} FOR UPDATE`;
        listo();
        await espera;
      },
      { timeout: 20000 },
    );
    await adquirido;
    const pendiente = editar(
      r.producto.id,
      { claveSolicitud: randomUUID(), version: 1, nombre: 'No autorizado' },
      cuenta,
    ).then((x) => x);
    try {
      let esperando = false;
      for (let i = 0; i < 100; i++) {
        const [f] = await prisma.$queryRaw<
          Array<{ n: bigint }>
        >`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE d.OBJECT_SCHEMA=DATABASE() AND d.OBJECT_NAME='productos'`;
        if (Number(f.n) > 0) {
          esperando = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(esperando).toBe(true);
      await prisma.sesion.updateMany({
        where: { usuarioId: cuenta.usuarioId },
        data: { revocadaEn: new Date() },
      });
    } finally {
      abrir();
      await bloqueo;
    }
    expect((await pendiente).status).toBe(401);
    expect(
      (
        await prisma.producto.findUniqueOrThrow({
          where: { id: r.producto.id },
        })
      ).version,
    ).toBe(1);
  });
  it('devuelve un grupo sin color como borrador incompleto sin fabricar un color', async () => {
    const { body: r } = await crear({
      claveSolicitud: randomUUID(),
      nombre: 'Modelo pendiente de color',
      grupoModelo: { id: grupoId, version: 1 },
    }).expect(201);
    expect(r.producto.grupoModelo.id).toBe(grupoId);
    expect(r.producto.colores).toEqual([]);
    expect(r.producto.variantes).toEqual([]);
    const consulta = await admin.cliente
      .get('/api/admin/productos/' + r.producto.id)
      .expect(200);
    expect(consulta.body.producto.colores).toEqual([]);
  });
  it('continúa después de SHO-9999 sin truncar el código', async () => {
    await prisma.secuenciaCodigoProducto.update({
      where: { id: 1 },
      data: { ultimoNumero: 9999 },
    });
    const { body: r } = await crear({
      claveSolicitud: randomUUID(),
      nombre: 'Límite de cuatro dígitos',
    }).expect(201);
    expect(r.producto.codigoInterno).toBe('SHO-10000');
    expect(await contador()).toBe(10000);
  });
});
