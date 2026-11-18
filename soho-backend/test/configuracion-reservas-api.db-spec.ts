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
import { ConfiguracionReservasService } from '../src/pedidos/reservas/configuracion-reservas.service.js';
import { VencimientosReservasService } from '../src/pedidos/reservas/vencimientos-reservas.service.js';
import type { ActualizarConfiguracionReservasDto } from '../src/pedidos/dto/actualizar-configuracion-reservas.dto.js';
import {
  usuarioPublico,
  type ContextoAuth,
} from '../src/autenticacion/sesiones/contexto-auth.js';
import { datosPedido } from './pedidos-fixtures.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Configuración de reservas requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url);
const prefijo = `rcfg-${randomBytes(5).toString('hex')}`,
  origen = 'http://localhost:4200',
  ruta = '/api/admin/configuracion/reservas',
  clave = 'clave sintética de reservas 2026';
type Navegador = { cliente: ReturnType<typeof request.agent>; csrf: string };
const usuarios: string[] = [];
const cuerpo = (cambio: Partial<ActualizarConfiguracionReservasDto> = {}) => ({
  version: 11,
  confirmado: true as const,
  modo: 'HASTA_DECISION' as const,
  horas: null,
  accionVencimiento: null,
  accionCancelacion: 'PREGUNTAR' as const,
  ...cambio,
});

describe.sequential(
  'Configuración administrativa de reservas con HTTP y MySQL aislado',
  () => {
    let app: INestApplication,
      privado: string,
      admin: Navegador,
      otro: Navegador,
      cliente: Navegador;
    let politica: NonNullable<
      Awaited<ReturnType<typeof prisma.configuracionReserva.findUnique>>
    >;
    let marcaId: string,
      categoriaId: string,
      productoId: string,
      colorId: string,
      varianteId: string,
      tallaId: string | undefined;
    const sku = prefijo + '-BL-40';
    const registro = () =>
      prisma.configuracionReserva.findUniqueOrThrow({ where: { id: 1 } });
    const patch = (datos: object = cuerpo(), n = admin) =>
      n.cliente
        .patch(ruta)
        .set('Origin', origen)
        .set('X-CSRF-Token', n.csrf)
        .send(datos);
    async function contexto(indice = 0): Promise<ContextoAuth> {
      const s = await prisma.sesion.findFirstOrThrow({
        where: { usuarioId: usuarios[indice] },
        include: { usuario: true },
      });
      return { sesionId: s.id, usuario: usuarioPublico(s.usuario) };
    }
    async function crearPedido() {
      const r = await cliente.cliente
        .post('/api/pedidos')
        .set('Origin', origen)
        .set('X-CSRF-Token', cliente.csrf)
        .send(await datosPedido(sku))
        .expect(201);
      return prisma.pedido.findUniqueOrThrow({
        where: { codigo: r.body.pedido.codigo as string },
        include: {
          articulos: { include: { reservas: true } },
          pago: { include: { comprobantes: true } },
          eventos: true,
        },
      });
    }
    async function restaurarPolitica() {
      await prisma.configuracionReserva.upsert({
        where: { id: 1 },
        create: politica,
        update: politica,
      });
    }
    type PedidoCreado = Awaited<ReturnType<typeof crearPedido>>;
    const verPedido = (p: Pick<PedidoCreado, 'codigo'>) =>
      admin.cliente.get(`/api/admin/pedidos/${p.codigo}`).expect(200);
    const decidir = (
      p: {
        codigo: string;
        version: number;
        pago: { version: number; comprobantes: Array<{ id: string }> } | null;
      },
      accion: 'APROBADO' | 'OBSERVADO',
    ) =>
      admin.cliente
        .post(`/api/admin/pagos/${p.codigo}/decision`)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
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
                solicitud: 'CORREGIDO',
              }),
        });
    async function vencerPedido(p: PedidoCreado) {
      const reservas = await prisma.reservaInventario.findMany({
        where: { articulo: { pedidoId: p.id }, estado: 'ACTIVA' },
      });
      const venceEn = new Date(Date.now() - 1000);
      for (const r of reservas) {
        expect(r.modo).toBe('TIEMPO');
        // Simular el transcurso del plazo en MySQL aislado; no cambiar su política.
        await prisma.reservaInventario.update({
          where: { id: r.id },
          data: {
            creadoEn: new Date(venceEn.getTime() - r.horas! * 3600000),
            venceEn,
          },
        });
      }
      return app.get(VencimientosReservasService).procesarPedido(p.codigo);
    }
    beforeAll(async () => {
      privado = await mkdtemp(join(tmpdir(), 'soho-config-reservas-test-'));
      politica = await registro();
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
      const claveHash = await new ClavesService().crear(clave),
        navegadores: Navegador[] = [];
      for (const rol of ['ADMIN', 'ADMIN', 'CLIENTE'] as const) {
        const u = await prisma.usuario.create({
          data: {
            nombres: 'Ana',
            apellidos: 'Reservas',
            correo: `${prefijo}-${usuarios.length}@reservas.test`,
            claveHash,
            rol,
          },
        });
        usuarios.push(u.id);
        const agente = request.agent(app.getHttpServer()),
          inicial = await agente.get('/api/auth/csrf').expect(200);
        const login = await agente
          .post('/api/auth/login')
          .set('Origin', origen)
          .set('X-CSRF-Token', inicial.body.csrfToken as string)
          .send({ correo: u.correo, clave })
          .expect(200);
        navegadores.push({
          cliente: agente,
          csrf: login.body.csrfToken as string,
        });
      }
      [admin, otro, cliente] = navegadores;
      marcaId = (
        await prisma.marca.create({
          data: {
            codigo: randomBytes(4).toString('hex'),
            nombre: prefijo,
            slug: prefijo,
          },
        })
      ).id;
      categoriaId = (
        await prisma.categoria.create({
          data: { nombre: prefijo, slug: prefijo },
        })
      ).id;
      let talla = await prisma.talla.findUnique({
        where: { sistema_valor: { sistema: 'EU', valor: 40 } },
      });
      if (!talla) {
        talla = await prisma.talla.create({ data: { valor: 40 } });
        tallaId = talla.id;
      }
      productoId = (
        await prisma.producto.create({
          data: {
            nombre: 'Zapatilla de prueba de reservas',
            modelo: 'Prueba',
            slug: prefijo,
            codigoInterno: prefijo,
            codigoModelo: prefijo,
            estado: 'PUBLICADO',
            precio: '99.99',
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
      varianteId = (
        await prisma.variante.create({
          data: {
            productoColorId: colorId,
            tallaId: talla.id,
            sku,
            existencias: 5,
          },
        })
      ).id;
    });
    beforeEach(async () => {
      await restaurarPolitica();
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: {
          modo: 'HASTA_DECISION',
          horas: null,
          accionVencimiento: null,
          accionCancelacion: 'LIBERAR',
          version: 11,
          actualizadoPorId: null,
          actualizadoEn: politica.actualizadoEn,
        },
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      if (!varianteId) return;
      const ids = (
        await prisma.pedido.findMany({
          where: { articulos: { some: { varianteId } } },
          select: { id: true },
        })
      ).map((p) => p.id);
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
      if (varianteId)
        await prisma.variante.update({
          where: { id: varianteId },
          data: { existencias: 5, cantidadReservada: 0 },
        });
      await restaurarPolitica();
      await prisma.usuario.updateMany({
        where: { id: { in: usuarios } },
        data: { activo: true },
      });
      for (const [i, id] of usuarios.entries())
        await prisma.usuario.update({
          where: { id },
          data: { rol: i < 2 ? 'ADMIN' : 'CLIENTE' },
        });
      await prisma.sesion.updateMany({
        where: { usuarioId: { in: usuarios } },
        data: {
          revocadaEn: null,
          expiraEn: new Date(Date.now() + 3600000),
          ultimaActividadEn: new Date(),
        },
      });
    });
    afterAll(async () => {
      await app?.close();
      if (politica) await restaurarPolitica();
      await prisma.sesion.deleteMany({
        where: { usuarioId: { in: usuarios } },
      });
      await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
      if (varianteId)
        await prisma.variante.delete({ where: { id: varianteId } });
      if (colorId)
        await prisma.productoColor.delete({ where: { id: colorId } });
      if (productoId) {
        await prisma.imagenProducto.deleteMany({ where: { productoId } });
        await prisma.producto.delete({ where: { id: productoId } });
      }
      if (marcaId) await prisma.marca.delete({ where: { id: marcaId } });
      if (categoriaId)
        await prisma.categoria.delete({ where: { id: categoriaId } });
      if (tallaId) await prisma.talla.delete({ where: { id: tallaId } });
      await prisma.$disconnect();
      if (privado) await rm(privado, { recursive: true, force: true });
    });

    it('consulta la política real sin escribir y no expone datos privados del responsable', async () => {
      const antes = await registro(),
        r = await admin.cliente.get(ruta).expect(200);
      expect(r.headers['cache-control']).toContain('no-store');
      expect(r.body).toEqual({
        configuracion: {
          version: 11,
          modo: 'HASTA_DECISION',
          horas: null,
          accionVencimiento: null,
          accionCancelacion: 'LIBERAR',
          creadoEn: antes.creadoEn.toISOString(),
          actualizadoEn: antes.actualizadoEn.toISOString(),
          actualizadoPor: null,
        },
        capacidades: { reservaTemporalDisponible: true },
      });
      expect(await registro()).toEqual(antes);
    });
    it('guarda política, versión, fecha y responsable y conserva el resultado al consultar', async () => {
      const antes = await registro(),
        r = await patch().expect(200);
      expect(r.body.modificada).toBe(true);
      expect(r.body.capacidades.reservaTemporalDisponible).toBe(true);
      expect(r.body.configuracion).toMatchObject({
        version: 12,
        accionCancelacion: 'PREGUNTAR',
        actualizadoPor: { id: usuarios[0], nombre: 'Ana Reservas' },
      });
      expect(
        Date.parse(r.body.configuracion.actualizadoEn as string),
      ).toBeGreaterThanOrEqual(antes.actualizadoEn.getTime());
      expect(JSON.stringify(r.body)).not.toMatch(
        /correo|claveHash|csrf|sesionId/,
      );
      expect(
        (await otro.cliente.get(ruta).expect(200)).body.configuracion,
      ).toEqual(r.body.configuracion);
    });
    it('guardar sin cambios no incrementa versión ni cambia fechas o responsable', async () => {
      const antes = await registro(),
        r = await patch(cuerpo({ accionCancelacion: 'LIBERAR' })).expect(200);
      expect(r.body.modificada).toBe(false);
      expect(await registro()).toEqual(antes);
    });
    it('el segundo administrador se registra únicamente cuando cambia realmente la política', async () => {
      await patch().expect(200);
      const antes = await registro();
      expect(
        (await patch(cuerpo({ version: 12 }), otro).expect(200)).body
          .modificada,
      ).toBe(false);
      expect(await registro()).toEqual(antes);
      await patch(
        cuerpo({ version: 12, accionCancelacion: 'LIBERAR' }),
        otro,
      ).expect(200);
      expect(await registro()).toMatchObject({
        version: 13,
        actualizadoPorId: usuarios[1],
      });
    });
    it('rechaza una versión atrasada aunque los valores ya coincidan', async () => {
      await patch().expect(200);
      const antes = await registro();
      expect((await patch().expect(409)).body.codigo).toBe(
        'CONFIGURACION_RESERVAS_CAMBIADA',
      );
      expect(await registro()).toEqual(antes);
    });
    it('serializa dos administradores sin perder cambios ni incrementar dos veces', async () => {
      const resultados = await Promise.all([patch(), patch(cuerpo(), otro)]);
      expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      expect(await registro()).toMatchObject({
        version: 12,
        accionCancelacion: 'PREGUNTAR',
      });
    });
    it.each(['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'] as const)(
      'activa tiempo con %s y conserva versión, responsable y confirmación',
      async (accionVencimiento) => {
        const antes = await registro(),
          r = await patch(
            cuerpo({ modo: 'TIEMPO', horas: 24, accionVencimiento }),
          ).expect(200);
        expect(r.body.capacidades.reservaTemporalDisponible).toBe(true);
        expect(await registro()).toMatchObject({
          modo: 'TIEMPO',
          horas: 24,
          accionVencimiento,
          version: antes.version + 1,
          actualizadoPorId: usuarios[0],
        });
      },
    );
    it('lee una política temporal preexistente sin resetearla y permite confirmar sin cambios', async () => {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: { modo: 'TIEMPO', horas: 24, accionVencimiento: 'SOLO_ALERTAR' },
      });
      const antes = await registro(),
        r = await admin.cliente.get(ruta).expect(200);
      expect(r.body.configuracion).toMatchObject({ modo: 'TIEMPO', horas: 24 });
      expect(r.body.capacidades.reservaTemporalDisponible).toBe(true);
      expect(
        (
          await patch(
            cuerpo({
              modo: 'TIEMPO',
              horas: 24,
              accionVencimiento: 'SOLO_ALERTAR',
              accionCancelacion: 'LIBERAR',
            }),
          ).expect(200)
        ).body.modificada,
      ).toBe(false);
      expect(await registro()).toEqual(antes);
    });
    it('permite volver de tiempo a hasta decisión sin reescribir reservas temporales anteriores', async () => {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: { modo: 'TIEMPO', horas: 24, accionVencimiento: 'SOLO_ALERTAR' },
      });
      const p = await crearPedido(),
        anteriores = p.articulos[0].reservas;
      await patch().expect(200);
      const r = await prisma.reservaInventario.findMany({
        where: { pedidoArticuloId: p.articulos[0].id },
      });
      expect(r).toEqual(anteriores);
      expect(await registro()).toMatchObject({
        modo: 'HASTA_DECISION',
        horas: null,
        accionVencimiento: null,
      });
    });
    it('las reservas nuevas adoptan la versión; las anteriores, pedidos y existencias se conservan', async () => {
      const p = await crearPedido(),
        inventario = await prisma.variante.findUniqueOrThrow({
          where: { id: varianteId },
        });
      const cobertura = await prisma.zonaEntrega.findMany({
        orderBy: { id: 'asc' },
      });
      await patch().expect(200);
      expect(
        await prisma.pedido.findUniqueOrThrow({
          where: { id: p.id },
          include: {
            articulos: { include: { reservas: true } },
            pago: { include: { comprobantes: true } },
            eventos: true,
          },
        }),
      ).toEqual(p);
      expect(
        await prisma.variante.findUniqueOrThrow({ where: { id: varianteId } }),
      ).toEqual(inventario);
      const nuevo = await crearPedido();
      expect(p.articulos[0].reservas[0]).toMatchObject({
        configuracionVersion: 11,
        accionCancelacion: 'LIBERAR',
      });
      expect(nuevo.articulos[0].reservas[0]).toMatchObject({
        configuracionVersion: 12,
        accionCancelacion: 'PREGUNTAR',
        modo: 'HASTA_DECISION',
        horas: null,
        venceEn: null,
      });
      expect(
        await prisma.zonaEntrega.findMany({ orderBy: { id: 'asc' } }),
      ).toEqual(cobertura);
      expect(
        await prisma.movimientoInventario.count({ where: { varianteId } }),
      ).toBe(0);
    });
    it('checkout concurrente copia una política y versión coherentes', async () => {
      const [p, r] = await Promise.all([crearPedido(), patch()]);
      expect(r.status).toBe(200);
      const reserva = p.articulos[0].reservas[0];
      expect([
        [11, 'LIBERAR'],
        [12, 'PREGUNTAR'],
      ]).toContainEqual([
        reserva.configuracionVersion,
        reserva.accionCancelacion,
      ]);
      expect(await registro()).toMatchObject({
        version: 12,
        accionCancelacion: 'PREGUNTAR',
      });
    });
    it('edita una política temporal conservando las reservas anteriores', async () => {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: { modo: 'TIEMPO', horas: 24, accionVencimiento: 'SOLO_ALERTAR' },
      });
      const p = await crearPedido(),
        anteriores = p.articulos[0].reservas;
      await patch(
        cuerpo({
          modo: 'TIEMPO',
          horas: 48,
          accionVencimiento: 'SOLO_ALERTAR',
        }),
      ).expect(200);
      expect(await registro()).toMatchObject({
        modo: 'TIEMPO',
        horas: 48,
        version: 12,
      });
      expect(
        await prisma.reservaInventario.findMany({
          where: { pedidoArticuloId: p.articulos[0].id },
        }),
      ).toEqual(anteriores);
    });
    it.each([1, 999999])(
      'acepta el límite de %s horas y conserva el resultado sin otro cambio de versión',
      async (horas) => {
        const datos = cuerpo({
          modo: 'TIEMPO',
          horas,
          accionVencimiento: 'SOLO_ALERTAR',
        });
        const r = await patch(datos).expect(200);
        expect(r.body.configuracion).toMatchObject({
          modo: 'TIEMPO',
          horas,
          version: 12,
        });
        const antes = await registro();
        expect(
          (await patch({ ...datos, version: 12 }).expect(200)).body.modificada,
        ).toBe(false);
        expect(await registro()).toEqual(antes);
      },
    );
    it('dos administradores no sobrescriben duraciones temporales con una versión atrasada', async () => {
      const r = await Promise.all([
        patch(
          cuerpo({
            modo: 'TIEMPO',
            horas: 24,
            accionVencimiento: 'LIBERAR_Y_ALERTAR',
          }),
        ),
        patch(
          cuerpo({
            modo: 'TIEMPO',
            horas: 48,
            accionVencimiento: 'SOLO_ALERTAR',
          }),
          otro,
        ),
      ]);
      expect(r.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect((await registro()).version).toBe(12);
      expect([24, 48]).toContain((await registro()).horas);
    });
    it('checkout concurrente con activar tiempo copia íntegramente una de las políticas', async () => {
      const [p, r] = await Promise.all([
        crearPedido(),
        patch(
          cuerpo({
            modo: 'TIEMPO',
            horas: 24,
            accionVencimiento: 'LIBERAR_Y_ALERTAR',
          }),
        ),
      ]);
      expect(r.status).toBe(200);
      const reserva = p.articulos[0].reservas[0];
      expect([
        [11, 'HASTA_DECISION', null, null, 'LIBERAR'],
        [12, 'TIEMPO', 24, 'LIBERAR_Y_ALERTAR', 'PREGUNTAR'],
      ]).toContainEqual([
        reserva.configuracionVersion,
        reserva.modo,
        reserva.horas,
        reserva.accionVencimiento,
        reserva.accionCancelacion,
      ]);
      expect(reserva.venceEn?.getTime() ?? null).toBe(
        reserva.horas
          ? reserva.creadoEn.getTime() + reserva.horas * 3600000
          : null,
      );
    });
    it.each([
      ['LIBERAR_Y_ALERTAR', false],
      ['LIBERAR_Y_ALERTAR', true],
      ['SOLO_ALERTAR', false],
      ['SOLO_ALERTAR', true],
    ] as const)(
      'política activada con %s y observado=%s completa vencimiento, recuperación y aprobación',
      async (accionVencimiento, observado) => {
        await patch(
          cuerpo({
            modo: 'TIEMPO',
            horas: 1,
            accionVencimiento,
            accionCancelacion: 'LIBERAR',
          }),
        ).expect(200);
        const p = await crearPedido(),
          original = p.articulos[0].reservas[0];
        expect(original).toMatchObject({
          modo: 'TIEMPO',
          horas: 1,
          accionVencimiento,
          configuracionVersion: 12,
        });
        if (observado) await decidir(p, 'OBSERVADO').expect(201);
        const antes = await prisma.reservaInventario.findUniqueOrThrow({
          where: { id: original.id },
        });
        // Cambiar la política global no modifica ni elimina el plazo de este pedido.
        await patch(cuerpo({ version: 12 })).expect(200);
        expect(
          await prisma.reservaInventario.findUniqueOrThrow({
            where: { id: original.id },
          }),
        ).toEqual(antes);
        expect(await vencerPedido(p)).toBe(1);
        let actual = (await verPedido(p)).body.pedido;
        expect(actual.pago.estado).toBe(observado ? 'OBSERVADO' : 'PENDIENTE');
        expect(actual.estadoEntrega).toBe(
          accionVencimiento === 'LIBERAR_Y_ALERTAR'
            ? 'INCIDENCIA'
            : 'PENDIENTE',
        );
        const stock = await prisma.variante.findUniqueOrThrow({
          where: { id: varianteId },
        });
        expect(stock.existencias).toBe(5);
        expect(stock.cantidadReservada).toBe(
          accionVencimiento === 'LIBERAR_Y_ALERTAR' ? 0 : 2,
        );
        expect(
          await app.get(VencimientosReservasService).procesarPedido(p.codigo),
        ).toBe(0);
        if (accionVencimiento === 'LIBERAR_Y_ALERTAR') {
          actual = (
            await admin.cliente
              .post(`/api/admin/pedidos/${p.codigo}/reservas/recuperacion`)
              .set('Origin', origen)
              .set('X-CSRF-Token', admin.csrf)
              .send({
                versionPedido: actual.version,
                versionPago: actual.pago.version,
                motivo: 'Cliente confirma la recuperación de su reserva.',
                confirmado: true,
              })
              .expect(200)
          ).body.pedido;
          const nueva = await prisma.reservaInventario.findFirstOrThrow({
            where: { articulo: { pedidoId: p.id }, estado: 'ACTIVA' },
          });
          expect(nueva).toMatchObject({
            modo: 'TIEMPO',
            horas: 1,
            accionVencimiento,
            configuracionVersion: 12,
            accionCancelacion: 'LIBERAR',
          });
          expect(nueva.id).not.toBe(original.id);
        }
        if (observado) {
          actual = (
            await cliente.cliente
              .post(`/api/pedidos/${p.codigo}/comprobantes`)
              .set('Origin', origen)
              .set('X-CSRF-Token', cliente.csrf)
              .send({
                versionPedido: actual.version,
                versionPago: actual.pago.version,
                comprobanteId: actual.pago.comprobantes.at(-1).id,
                comprobante: (await datosPedido(sku)).comprobante,
              })
              .expect(201)
          ).body.pedido;
        }
        actual = (await decidir(actual, 'APROBADO').expect(201)).body.pedido;
        expect(actual.estadoEntrega).toBe('CONFIRMADO');
        // Una fecha posterior a la aprobación tampoco libera la reserva.
        expect(await vencerPedido(p)).toBe(0);
        actual = (
          await admin.cliente
            .post(`/api/admin/pedidos/${p.codigo}/preparacion`)
            .set('Origin', origen)
            .set('X-CSRF-Token', admin.csrf)
            .send({ versionPedido: actual.version })
            .expect(200)
        ).body.pedido;
        await admin.cliente
          .post(`/api/admin/pedidos/${p.codigo}/envio`)
          .set('Origin', origen)
          .set('X-CSRF-Token', admin.csrf)
          .send({
            versionPedido: actual.version,
            transportista: 'Reparto SOHO',
            referenciaSeguimiento: '000123',
          })
          .expect(200);
        expect(
          await prisma.variante.findUniqueOrThrow({
            where: { id: varianteId },
          }),
        ).toMatchObject({ existencias: 3, cantidadReservada: 0 });
        expect(
          await prisma.movimientoInventario.count({ where: { varianteId } }),
        ).toBe(1);
      },
    );
    it.each(['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'] as const)(
      'aprobar antes de vencer %s conserva la reserva sin atender el vencimiento',
      async (accionVencimiento) => {
        await patch(
          cuerpo({ modo: 'TIEMPO', horas: 24, accionVencimiento }),
        ).expect(200);
        const p = await crearPedido();
        await decidir(p, 'APROBADO').expect(201);
        expect(await vencerPedido(p)).toBe(0);
        expect(
          await prisma.reservaInventario.findFirstOrThrow({
            where: { articulo: { pedidoId: p.id } },
          }),
        ).toMatchObject({ estado: 'ACTIVA', vencimientoAtendidoEn: null });
        expect(
          await prisma.variante.findUniqueOrThrow({
            where: { id: varianteId },
          }),
        ).toMatchObject({ existencias: 5, cantidadReservada: 2 });
      },
    );
    it('activar tiempo y editarlo no altera reservas anteriores hasta decisión', async () => {
      const p = await crearPedido(),
        anterior = p.articulos[0].reservas[0];
      await patch(
        cuerpo({
          modo: 'TIEMPO',
          horas: 24,
          accionVencimiento: 'LIBERAR_Y_ALERTAR',
        }),
      ).expect(200);
      await patch(
        cuerpo({
          version: 12,
          modo: 'TIEMPO',
          horas: 48,
          accionVencimiento: 'SOLO_ALERTAR',
        }),
      ).expect(200);
      expect(
        await prisma.reservaInventario.findUniqueOrThrow({
          where: { id: anterior.id },
        }),
      ).toEqual(anterior);
      const nuevo = await crearPedido();
      expect(nuevo.articulos[0].reservas[0]).toMatchObject({
        modo: 'TIEMPO',
        horas: 48,
        configuracionVersion: 13,
        accionVencimiento: 'SOLO_ALERTAR',
      });
    });
    it('no crea silenciosamente la configuración cuando falta la fila única', async () => {
      expect(await prisma.reservaInventario.count()).toBe(0);
      await prisma.configuracionReserva.delete({ where: { id: 1 } });
      expect((await admin.cliente.get(ruta).expect(503)).body.codigo).toBe(
        'CONFIGURACION_RESERVAS_NO_DISPONIBLE',
      );
      await patch().expect(503);
      expect(await prisma.configuracionReserva.count()).toBe(0);
    });
    it.each(['get', 'patch'] as const)(
      'exige ADMIN para %s y rechaza anónimo y CLIENTE',
      async (metodo) => {
        const anonimo = request.agent(app.getHttpServer());
        if (metodo === 'get') {
          await anonimo.get(ruta).expect(401);
          await cliente.cliente.get(ruta).expect(403);
        } else {
          await anonimo
            .patch(ruta)
            .set('Origin', origen)
            .send(cuerpo())
            .expect(401);
          await patch(cuerpo(), cliente).expect(403);
        }
      },
    );
    it('exige CSRF y origen autorizado sin escrituras parciales', async () => {
      const antes = await registro();
      await admin.cliente
        .patch(ruta)
        .set('Origin', origen)
        .send(cuerpo())
        .expect(403);
      await admin.cliente
        .patch(ruta)
        .set('Origin', 'https://otro.test')
        .set('X-CSRF-Token', admin.csrf)
        .send(cuerpo())
        .expect(403);
      expect(await registro()).toEqual(antes);
    });
    it.each([
      { horas: 24 },
      { accionVencimiento: 'SOLO_ALERTAR' },
      { confirmado: false },
      { actualizadoPorId: 'otro' },
      { version: '11' },
    ])('rechaza datos inválidos en HTTP sin cambios: %j', async (cambio) => {
      const antes = await registro();
      await patch({ ...cuerpo(), ...cambio }).expect(400);
      expect(await registro()).toEqual(antes);
    });
    it('el límite de versiones admite lectura y sin cambios pero impide desbordamiento', async () => {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: { version: 4294967295 },
      });
      expect(
        (await admin.cliente.get(ruta).expect(200)).body.configuracion.version,
      ).toBe(4294967295);
      await patch(
        cuerpo({ version: 4294967295, accionCancelacion: 'LIBERAR' }),
      ).expect(200);
      expect(
        (await patch(cuerpo({ version: 4294967295 })).expect(409)).body.codigo,
      ).toBe('VERSION_RESERVAS_AGOTADA');
      expect((await registro()).version).toBe(4294967295);
    });
    it('rechaza una fecha futura antes de cambiar política o responsable', async () => {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: { actualizadoEn: new Date(Date.now() + 3600000) },
      });
      const antes = await registro();
      expect((await patch().expect(409)).body.codigo).toBe(
        'CONFIGURACION_RESERVAS_INCONSISTENTE',
      );
      expect(await registro()).toEqual(antes);
    });
    it('un fallo antes de COMMIT revierte política, versión y responsable', async () => {
      const antes = await registro(),
        ctx = await contexto(),
        escritura = app.get(EscrituraPedidoService),
        real = escritura.transaccion.bind(escritura);
      vi.spyOn(escritura, 'transaccion').mockImplementationOnce(
        async (operacion) =>
          real(async (tx) => {
            await operacion(tx);
            throw Error('Fallo antes de COMMIT');
          }),
      );
      await expect(
        app.get(ConfiguracionReservasService).actualizar(cuerpo(), ctx),
      ).rejects.toThrow('antes de COMMIT');
      expect(await registro()).toEqual(antes);
    });
    it('recupera por GET un COMMIT sin respuesta y rechaza repetir la versión anterior', async () => {
      const ctx = await contexto(),
        real = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementationOnce(
        async (...args) => {
          await Reflect.apply(real, prisma, args);
          throw Error('Respuesta perdida después de COMMIT');
        },
      );
      await expect(
        app.get(ConfiguracionReservasService).actualizar(cuerpo(), ctx),
      ).rejects.toThrow('después de COMMIT');
      const guardada = await registro();
      expect(
        (await admin.cliente.get(ruta).expect(200)).body.configuracion,
      ).toMatchObject({
        version: 12,
        accionCancelacion: 'PREGUNTAR',
        actualizadoPor: { id: usuarios[0] },
      });
      await patch().expect(409);
      expect(await registro()).toEqual(guardada);
    });
    it.each([
      'revocada',
      'degradada',
      'inactiva',
      'vencida',
      'inactividad',
    ] as const)(
      'revalida una sesión %s dentro de las transacciones de lectura y escritura',
      async (caso) => {
        const antes = await registro(),
          ctx = await contexto();
        if (caso === 'degradada' || caso === 'inactiva')
          await prisma.usuario.update({
            where: { id: usuarios[0] },
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
        const service = app.get(ConfiguracionReservasService);
        await expect(service.consultar(ctx)).rejects.toMatchObject({
          status: 401,
        });
        await expect(service.actualizar(cuerpo(), ctx)).rejects.toMatchObject({
          status: 401,
        });
        expect(await registro()).toEqual(antes);
      },
    );
    it('una revocación mientras espera el bloqueo de sesión impide guardar', async () => {
      const antes = await registro(),
        ctx = await contexto();
      let listo!: () => void, continuar!: () => void, iniciado!: () => void;
      const bloqueado = new Promise<void>((r) => (listo = r)),
        permiso = new Promise<void>((r) => (continuar = r)),
        entrada = new Promise<void>((r) => (iniciado = r));
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
        app.get(ConfiguracionReservasService).actualizar(cuerpo(), ctx),
      ).rejects.toMatchObject({ status: 401 });
      try {
        await entrada;
      } finally {
        continuar();
      }
      await retencion;
      await resultado;
      expect(await registro()).toEqual(antes);
    });
  },
);
