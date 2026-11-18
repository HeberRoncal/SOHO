import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
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
import { ComprobantesPrivadosService } from '../src/pedidos/archivos/comprobantes-privados.service.js';
import { PedidosService } from '../src/pedidos/pedidos.service.js';
import { PagosPedidosService } from '../src/pedidos/pagos/pagos-pedidos.service.js';
import { EnviosPedidosService } from '../src/pedidos/envios/envios-pedidos.service.js';
import { EscrituraPedidoService } from '../src/pedidos/seguridad/escritura-pedido.service.js';
import type { ContextoAuth } from '../src/autenticacion/sesiones/contexto-auth.js';
import type { RespuestaPedido } from '../src/pedidos/dto/respuesta-pedido.js';
import { datosPedido } from './pedidos-fixtures.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Pedidos requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url);
const prefijo = `papi-${randomBytes(5).toString('hex')}`,
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

describe.sequential(
  'Pedidos reales con HTTP, archivos privados y MySQL aislado',
  () => {
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
    const archivos = async () =>
      readdir(join(privado, 'comprobantes')).catch(() => [] as string[]);
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
    const sinEscrituras = async () => {
      expect(await pedidosPropios()).toHaveLength(0);
      expect(
        await prisma.variante.findMany({
          where: { id: { in: idsVariantes } },
          select: { cantidadReservada: true },
        }),
      ).toEqual([{ cantidadReservada: 0 }, { cantidadReservada: 0 }]);
    };
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

    it('crea el conjunto completo para la cuenta y reserva sin descontar stock físico', async () => {
      const d = await nuevo();
      const r = await enviar(propietario, d).expect(201);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body).toMatchObject({
        reutilizado: false,
        pedido: {
          total: '199.98',
          costoEnvio: '0.00',
          estadoEntrega: 'PENDIENTE',
          entrega: { destinatario: 'Otra Persona', distrito: 'la-esperanza' },
          pago: { estado: 'PENDIENTE', metodo: 'YAPE' },
        },
      });
      const p = await prisma.pedido.findUniqueOrThrow({
        where: { claveCreacion: d.claveCreacion },
        include: {
          articulos: { include: { unidades: true, reservas: true } },
          pago: { include: { comprobantes: true } },
          facturacion: true,
          eventos: true,
        },
      });
      expect(p.usuarioId).toBe(idsUsuarios[0]);
      expect(p.accesoInvitadoHash).toBeNull();
      expect(p.facturacion?.numeroDocumento).toBe('00123456');
      expect(p.articulos[0].unidades).toHaveLength(2);
      expect(p.articulos[0].reservas[0]).toMatchObject({
        cantidad: 2,
        estado: 'ACTIVA',
        modo: 'HASTA_DECISION',
        horas: null,
      });
      expect(p.eventos).toHaveLength(3);
      expect(
        await prisma.variante.findUnique({ where: { id: idsVariantes[0] } }),
      ).toMatchObject({ existencias: 5, cantidadReservada: 2 });
      expect(
        await prisma.movimientoInventario.count({
          where: { varianteId: idsVariantes[0] },
        }),
      ).toBe(0);
      expect(JSON.stringify(r.body)).not.toMatch(
        /archivoClave|archivoSha256|solicitudHash|accesoInvitado|responsableId|usuarioId|configuracionId/,
      );
    });
    it('crea un invitado sin atribuirlo a una cuenta con el mismo correo', async () => {
      const n = await invitado(),
        d = await nuevo();
      d.contacto.correo = (
        await prisma.usuario.findUniqueOrThrow({
          where: { id: idsUsuarios[0] },
        })
      ).correo;
      const r = await enviar(n, d).expect(201);
      const p = await prisma.pedido.findUniqueOrThrow({
        where: { claveCreacion: d.claveCreacion },
      });
      expect(p.usuarioId).toBeNull();
      expect(p.accesoInvitadoHash).toBe(
        createHash('sha256').update(n.acceso!).digest('hex'),
      );
      expect(p.accesoInvitadoHash).not.toBe(n.acceso);
      await get(n, `${ruta}/${r.body.pedido.codigo}`).expect(200);
      await get(propietario, `${ruta}/${r.body.pedido.codigo}`).expect(404);
      await get(admin, `${ruta}/${r.body.pedido.codigo}`).expect(200);
      await get(n, `${ruta}/mios`).expect(401);
    });
    it('reintenta sin duplicar pedido, reserva ni archivo aunque después cambien catálogo y tarifa', async () => {
      const n = await invitado(),
        d = await nuevo(),
        antes = (await archivos()).length;
      await prisma.zonaEntrega.update({
        where: { codigo: 'trujillo' },
        data: { tarifa: '7.25' },
      });
      d.entrega.distrito = 'trujillo';
      d.cotizacion.costoEnvio = '7.25';
      d.cotizacion.total = '207.23';
      const r = await enviar(n, d).expect(201);
      await prisma.producto.update({
        where: { id: productoId },
        data: { precio: '119.99', nombre: `${prefijo} nombre modificado` },
      });
      await prisma.zonaEntrega.update({
        where: { codigo: 'trujillo' },
        data: { tarifa: '8.25' },
      });
      const repetido = await enviar(n, d).expect(200);
      expect(repetido.body).toMatchObject({
        reutilizado: true,
        pedido: {
          codigo: r.body.pedido.codigo,
          total: '207.23',
          costoEnvio: '7.25',
        },
      });
      expect(repetido.body.pedido.articulos).toEqual(r.body.pedido.articulos);
      expect(await pedidosPropios()).toHaveLength(1);
      expect((await archivos()).length).toBe(antes + 1);
    });
    it('rechaza reutilizar la clave con otros datos o propietario sin filtrar el pedido', async () => {
      const d = await nuevo();
      await enviar(propietario, d).expect(201);
      await enviar(
        propietario,
        Object.assign({}, d, { metodoPago: 'PLIN' }),
      ).expect(409);
      await enviar(otro, d).expect(409);
      await enviar(await invitado(), d).expect(409);
      expect(await pedidosPropios()).toHaveLength(1);
    });
    it('el código visible no concede acceso y el secreto de invitado vence', async () => {
      const n = await invitado(),
        d = await nuevo();
      const r = await enviar(n, d).expect(201),
        destino = `${ruta}/${r.body.pedido.codigo}`;
      await request(app.getHttpServer()).get(destino).expect(401);
      await get(await invitado(), destino).expect(404);
      await prisma.pedido.update({
        where: { claveCreacion: d.claveCreacion },
        data: {
          accesoInvitadoExpiraEn: new Date(Date.now() - 1000),
          creadoEn: new Date(Date.now() - 5000),
        },
      });
      await get(n, destino).expect(404);
      await enviar(n, d).expect(409);
    });
    it('protege archivo y pedido por propiedad, con acceso administrativo explícito', async () => {
      const r = await enviar(propietario, await nuevo()).expect(201);
      const destino = r.body.pedido.pago.comprobantes[0].ruta as string;
      const archivo = await get(propietario, destino).expect(200);
      expect(archivo.headers['content-type']).toMatch(/image\/png/);
      expect(archivo.headers['x-content-type-options']).toBe('nosniff');
      expect(archivo.headers['cache-control']).toBe('no-store');
      await get(otro, destino).expect(404);
      await get(await invitado(), destino).expect(404);
      await get(admin, destino).expect(200);
      await get(
        propietario,
        `${ruta}/SOHO-NOEXISTENTE/comprobantes/${r.body.pedido.pago.comprobantes[0].id}`,
      ).expect(404);
      await get(
        propietario,
        `${ruta}/${r.body.pedido.codigo}/comprobantes/${randomUUID()}`,
      ).expect(404);
    });
    it('excluye notas internas y mantiene datos históricos al editar perfil y catálogo', async () => {
      const d = await nuevo(),
        r = await enviar(propietario, d).expect(201);
      const p = (await pedidosPropios())[0];
      await prisma.eventoPedido.create({
        data: {
          pedidoId: p.id,
          secuencia: 4,
          versionPedido: 1,
          tipo: 'NOTA_INTERNA',
          actor: 'ADMIN',
          responsableId: idsUsuarios[2],
          titulo: 'Secreto interno',
          descripcion: 'No publicar esta nota',
        },
      });
      await prisma.usuario.update({
        where: { id: idsUsuarios[0] },
        data: { nombres: 'Nuevo nombre' },
      });
      await prisma.producto.update({
        where: { id: productoId },
        data: { precio: '123.45' },
      });
      const detalle = await get(propietario, `${ruta}/${p.codigo}`).expect(200);
      expect(detalle.body.pedido.contacto).toEqual(d.contacto);
      expect(detalle.body.pedido.articulos).toEqual(r.body.pedido.articulos);
      expect(detalle.body.pedido.eventos).toHaveLength(3);
      expect(JSON.stringify(detalle.body)).not.toMatch(
        /Secreto interno|No publicar/,
      );
    });
    it.each([
      ['trujillo', 'COBERTURA_TARIFA_PENDIENTE'],
      ['moche', 'COBERTURA_DESHABILITADA'],
      ['desconocido', 'COBERTURA_DESHABILITADA'],
    ])(
      'rechaza cobertura %s sin archivos ni reservas',
      async (distrito, codigo) => {
        const d = await nuevo(),
          antes = (await archivos()).length;
        d.entrega.distrito = distrito;
        const r = await enviar(propietario, d).expect(422);
        expect(r.body.codigo).toBe(codigo);
        await sinEscrituras();
        expect((await archivos()).length).toBe(antes);
      },
    );
    it.each(['tarifa', 'plazo', 'precio', 'total'])(
      'detecta cambio de %s y revierte toda escritura',
      async (campo) => {
        const d = await nuevo(),
          antes = (await archivos()).length;
        if (campo === 'tarifa') {
          d.entrega.distrito = 'trujillo';
          d.cotizacion.costoEnvio = '7.25';
          d.cotizacion.total = '207.23';
          await prisma.zonaEntrega.update({
            where: { codigo: 'trujillo' },
            data: { tarifa: '8.25' },
          });
        }
        if (campo === 'plazo')
          await prisma.zonaEntrega.update({
            where: { codigo: 'la-esperanza' },
            data: { plazo: 'Dos días' },
          });
        if (campo === 'precio')
          await prisma.producto.update({
            where: { id: productoId },
            data: { precio: '123.45' },
          });
        if (campo === 'total') d.cotizacion.total = '1.00';
        await enviar(propietario, d).expect(409);
        await sinEscrituras();
        expect((await archivos()).length).toBe(antes);
      },
    );
    it.each(['borrador', 'variante', 'marca', 'categoria', 'imagenes'])(
      'rechaza un artículo retirado por %s',
      async (caso) => {
        if (caso === 'borrador')
          await prisma.producto.update({
            where: { id: productoId },
            data: { estado: 'BORRADOR' },
          });
        if (caso === 'variante')
          await prisma.variante.update({
            where: { id: idsVariantes[0] },
            data: { habilitada: false },
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
        if (caso === 'imagenes')
          await prisma.imagenProducto.deleteMany({ where: { productoId } });
        await enviar(propietario, await nuevo()).expect(422);
        await sinEscrituras();
      },
    );
    it('revierte también las reservas de las primeras líneas si falla la última', async () => {
      const d = await nuevo();
      d.articulos.push({
        sku: skuOtro,
        cantidad: 2,
        precioUnitarioEsperado: '99.99',
      });
      d.cotizacion.total = '399.96';
      await prisma.variante.update({
        where: { id: idsVariantes[1] },
        data: { existencias: 0 },
      });
      await enviar(propietario, d).expect(409);
      await sinEscrituras();
    });
    it('dos compras concurrentes no reservan dos veces las últimas unidades', async () => {
      await prisma.variante.update({
        where: { id: idsVariantes[0] },
        data: { existencias: 2 },
      });
      const a = await invitado(),
        b = await invitado();
      const respuestas = await Promise.all([
        enviar(a, await nuevo()),
        enviar(b, await nuevo()),
      ]);
      expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await pedidosPropios()).toHaveLength(1);
      expect(
        await prisma.variante.findUnique({ where: { id: idsVariantes[0] } }),
      ).toMatchObject({ existencias: 2, cantidadReservada: 2 });
    });
    it('dos solicitudes concurrentes con la misma clave devuelven un único pedido', async () => {
      const n = await invitado(),
        d = await nuevo(),
        antes = (await archivos()).length;
      const respuestas = await Promise.all([enviar(n, d), enviar(n, d)]);
      expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 201,
      ]);
      expect(respuestas[0].body.pedido.codigo).toBe(
        respuestas[1].body.pedido.codigo,
      );
      expect(await pedidosPropios()).toHaveLength(1);
      expect((await archivos()).length).toBe(antes + 1);
      expect(
        await prisma.variante.findUnique({ where: { id: idsVariantes[0] } }),
      ).toMatchObject({ cantidadReservada: 2 });
    });
    it('una sesión revocada no se transforma silenciosamente en compra de invitado', async () => {
      const n = await invitado();
      const usuario = await prisma.usuario.findUniqueOrThrow({
        where: { id: idsUsuarios[0] },
      });
      const sesion = await n.cliente
        .post('/api/auth/login')
        .set('Origin', origen)
        .set('X-CSRF-Token', n.csrf)
        .send({ correo: usuario.correo, clave })
        .expect(200);
      await prisma.sesion.updateMany({
        where: { usuarioId: idsUsuarios[0] },
        data: { revocadaEn: new Date() },
      });
      await enviar(
        {
          cliente: n.cliente,
          csrf: sesion.body.csrfToken as string,
          acceso: n.acceso,
        },
        await nuevo(),
      ).expect(401);
      await sinEscrituras();
    });
    it('revalida la sesión dentro de la transacción tras procesar la imagen', async () => {
      const n = await invitado();
      const usuario = await prisma.usuario.findUniqueOrThrow({
        where: { id: idsUsuarios[1] },
      });
      const sesion = await n.cliente
        .post('/api/auth/login')
        .set('Origin', origen)
        .set('X-CSRF-Token', n.csrf)
        .send({ correo: usuario.correo, clave })
        .expect(200);
      const archivosServicio = app.get(ComprobantesPrivadosService),
        preparar = archivosServicio.preparar.bind(archivosServicio);
      vi.spyOn(archivosServicio, 'preparar').mockImplementationOnce(
        async (...args) => {
          const preparado = await preparar(...args);
          await prisma.sesion.updateMany({
            where: { usuarioId: idsUsuarios[1] },
            data: { revocadaEn: new Date() },
          });
          return preparado;
        },
      );
      await enviar(
        { cliente: n.cliente, csrf: sesion.body.csrfToken as string },
        await nuevo(),
      ).expect(401);
      await sinEscrituras();
    });
    it('exige CSRF, origen permitido y contrato estricto antes de crear', async () => {
      const n = await invitado(),
        d = await nuevo();
      await n.cliente
        .post(ruta)
        .set('Origin', origen)
        .set('X-Pedido-Acceso', n.acceso!)
        .send(d)
        .expect(403);
      await n.cliente
        .post(ruta)
        .set('Origin', 'https://otro.test')
        .set('X-CSRF-Token', n.csrf)
        .send(d)
        .expect(403);
      await enviar(
        n,
        Object.assign({}, d, { usuarioId: idsUsuarios[0] }),
      ).expect(400);
      await sinEscrituras();
    });
    it('admite un comprobante real de más de 16 KiB y limita el JSON de creación a 8 MiB', async () => {
      const d = await nuevo();
      const aleatorio = randomBytes(128 * 128 * 3);
      d.comprobante.contenidoBase64 = (
        await sharp(aleatorio, {
          raw: { width: 128, height: 128, channels: 3 },
        })
          .png()
          .toBuffer()
      ).toString('base64');
      expect(d.comprobante.contenidoBase64.length).toBeGreaterThan(16384);
      await enviar(await invitado(), d).expect(201);
      const excesivo = await nuevo();
      excesivo.comprobante.contenidoBase64 = 'a'.repeat(8 * 1024 * 1024);
      await enviar(await invitado(), excesivo).expect(413);
      await propietario.cliente
        .patch('/api/auth/me')
        .set('Origin', origen)
        .set('X-CSRF-Token', propietario.csrf)
        .send({ nombres: 'x'.repeat(17000), apellidos: 'Prueba' })
        .expect(413);
    });
    it('lista exclusivamente los propios con paginación estricta', async () => {
      await enviar(otro, await nuevo()).expect(201);
      await enviar(otro, await nuevo()).expect(201);
      const r = await get(otro, `${ruta}/mios?limite=1&pagina=1`).expect(200);
      expect(r.body.pedidos).toHaveLength(1);
      expect(r.body.paginacion).toEqual({
        pagina: 1,
        limite: 1,
        total: 2,
        paginas: 2,
      });
      expect(
        (await get(propietario, `${ruta}/mios`).expect(200)).body.pedidos,
      ).toEqual([]);
      await get(otro, `${ruta}/mios?pagina=0`).expect(400);
      await get(otro, `${ruta}/mios?limite=51`).expect(400);
      await get(otro, `${ruta}/mios?usuarioId=otro`).expect(400);
    });
    it('conserva la política y el vencimiento calculado al crear la reserva', async () => {
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: {
          modo: 'TIEMPO',
          horas: 2,
          accionVencimiento: 'SOLO_ALERTAR',
          version: 2,
        },
      });
      const d = await nuevo();
      await enviar(otro, d).expect(201);
      const p = (await pedidosPropios())[0];
      const reserva = await prisma.reservaInventario.findFirstOrThrow({
        where: { articulo: { pedidoId: p.id } },
      });
      expect(reserva).toMatchObject({
        configuracionVersion: 2,
        horas: 2,
        accionVencimiento: 'SOLO_ALERTAR',
        estado: 'ACTIVA',
      });
      expect(reserva.venceEn!.getTime() - reserva.creadoEn.getTime()).toBe(
        2 * 3_600_000,
      );
      await prisma.configuracionReserva.update({
        where: { id: 1 },
        data: { horas: 3, version: 3 },
      });
      expect(
        (
          await prisma.reservaInventario.findUniqueOrThrow({
            where: { id: reserva.id },
          })
        ).horas,
      ).toBe(2);
    });
    it('almacena factura y responde sin filtrar datos del disco si el archivo falta', async () => {
      const d = await nuevo();
      d.facturacion = {
        tipo: 'FACTURA',
        tipoDocumento: 'RUC',
        numeroDocumento: '20123456789',
        razonSocial: 'Empresa Prueba',
        domicilioFiscal: 'Av. Fiscal 123',
      };
      const r = await enviar(otro, d).expect(201);
      expect(r.body.pedido.facturacion).toMatchObject(d.facturacion);
      const c = await prisma.comprobantePago.findFirstOrThrow({
        where: { pago: { pedido: { claveCreacion: d.claveCreacion } } },
      });
      await unlink(join(privado, c.archivoClave));
      const respuesta = await get(
        otro,
        r.body.pedido.pago.comprobantes[0].ruta as string,
      ).expect(503);
      expect(JSON.stringify(respuesta.body)).not.toContain(privado);
    });
    it('recupera por clave de creación con la misma autorización privada y sin filtrar otras compras', async () => {
      const n = await invitado(),
        d = await nuevo();
      const creado = await enviar(n, d).expect(201);
      const destino = `${ruta}/creacion/${d.claveCreacion}`;
      const recuperado = await get(n, destino).expect(200);
      expect(recuperado.body.pedido.codigo).toBe(creado.body.pedido.codigo);
      expect(recuperado.headers['cache-control']).toBe('no-store');
      await get(await invitado(), destino).expect(404);
      await get(propietario, destino).expect(404);
      await request(app.getHttpServer()).get(destino).expect(401);
      await get(n, `${ruta}/creacion/${randomUUID()}`).expect(404);
      await get(n, `${ruta}/creacion/no-es-uuid`).expect(404);
      expect(await pedidosPropios()).toHaveLength(1);
    });
    type PedidoRevision = {
      codigo: string;
      version: number;
      pago: { version: number; comprobantes: Array<{ id: string }> };
    };
    const decision = (p: PedidoRevision, accion = 'APROBADO') => ({
      versionPedido: p.version,
      versionPago: p.pago.version,
      comprobanteId: p.pago.comprobantes.at(-1)!.id,
      accion,
      ...(accion === 'APROBADO'
        ? { confirmado: true }
        : {
            motivo: 'ILEGIBLE',
            mensaje: 'Adjunta una imagen completa y legible.',
            ...(accion === 'OBSERVADO'
              ? { solicitud: 'LEGIBLE' }
              : { confirmado: true }),
          }),
    });
    const revisar = (n: Navegador, p: PedidoRevision, accion = 'APROBADO') =>
      n.cliente
        .post(`/api/admin/pagos/${p.codigo}/decision`)
        .set('Origin', origen)
        .set('X-CSRF-Token', n.csrf)
        .send(decision(p, accion));
    const operar = (
      p: Pick<PedidoRevision, 'codigo' | 'version'>,
      accion: 'preparacion' | 'envio' | 'entrega',
      extras: object = {},
      n = admin,
    ) =>
      n.cliente
        .post(`/api/admin/pedidos/${p.codigo}/${accion}`)
        .set('Origin', origen)
        .set('X-CSRF-Token', n.csrf)
        .send({
          versionPedido: p.version,
          ...(accion === 'envio'
            ? { transportista: 'SOHO reparto', referenciaSeguimiento: '000123' }
            : {}),
          ...(accion === 'entrega' ? { confirmado: true } : {}),
          ...extras,
        });
    const aprobado = async (dosSkus = false): Promise<RespuestaPedido> => {
      const d = await nuevo();
      if (dosSkus) {
        d.articulos.push({ ...d.articulos[0], sku: skuOtro });
        d.cotizacion.total = '399.96';
      }
      const p = (await enviar(propietario, d).expect(201)).body
        .pedido as PedidoRevision;
      return (await revisar(admin, p).expect(201)).body
        .pedido as RespuestaPedido;
    };
    const contextoAdmin = async (): Promise<ContextoAuth> => {
      const s = await prisma.sesion.findFirstOrThrow({
        where: { usuarioId: idsUsuarios[2] },
      });
      return {
        sesionId: s.id,
        usuario: {
          id: idsUsuarios[2],
          nombres: 'Ana',
          apellidos: 'Prueba',
          correo: 'admin@pedidos.test',
          rol: 'ADMIN',
          correoVerificado: false,
        },
      };
    };

    it('despacha las últimas unidades y mantiene el responsable propio de cada etapa', async () => {
      await prisma.variante.updateMany({
        where: { id: { in: idsVariantes } },
        data: { existencias: 2 },
      });
      const p = await aprobado(true);
      const prep = (await operar(p, 'preparacion').expect(200)).body.pedido;
      await prisma.usuario.update({
        where: { id: idsUsuarios[1] },
        data: { rol: 'ADMIN' },
      });
      const desp = (await operar(prep, 'envio', {}, otro).expect(200)).body
        .pedido;
      const entregado = (await operar(desp, 'entrega').expect(200)).body.pedido;
      expect(entregado.responsablesEnvio).toMatchObject({
        preparacion: { id: idsUsuarios[2] },
        despacho: { id: idsUsuarios[1] },
        entrega: { id: idsUsuarios[2] },
      });
      expect(entregado.envio.preparacionIniciadaEn).toBe(
        prep.envio.preparacionIniciadaEn,
      );
      expect(entregado.envio.despachadoEn).toBe(desp.envio.despachadoEn);
      expect(
        new Date(entregado.envio.entregadoEn).getTime(),
      ).toBeGreaterThanOrEqual(new Date(desp.envio.despachadoEn).getTime());
      expect(
        (
          await prisma.variante.findMany({
            where: { id: { in: idsVariantes } },
          })
        ).every((v) => v.existencias === 0 && v.cantidadReservada === 0),
      ).toBe(true);
      expect(
        (await prisma.movimientoInventario.findMany()).every(
          (m) => m.usuarioResponsableId === idsUsuarios[1],
        ),
      ).toBe(true);
      const listado = await get(
        admin,
        '/api/admin/pedidos?entrega=ENTREGADO',
      ).expect(200);
      expect(listado.body.pedidos[0].envio).toEqual(entregado.envio);
      const propios = await get(propietario, `${ruta}/mios`).expect(200);
      expect(propios.body.pedidos[0].envio).toEqual(entregado.envio);
      expect(JSON.stringify(propios.body)).not.toContain('responsablesEnvio');
    });

    it('revalida una sesión revocada mientras esperaba su bloqueo en MySQL', async () => {
      const p = await aprobado(),
        contexto = await contextoAdmin();
      let bloqueado!: () => void, liberar!: () => void, iniciado!: () => void;
      const listo = new Promise<void>((r) => {
        bloqueado = r;
      });
      const permiso = new Promise<void>((r) => {
        liberar = r;
      });
      const entrada = new Promise<void>((r) => {
        iniciado = r;
      });
      const bloqueo = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM sesiones WHERE id = ${contexto.sesionId} FOR UPDATE`;
          bloqueado();
          await permiso;
          await tx.sesion.update({
            where: { id: contexto.sesionId },
            data: { revocadaEn: new Date() },
          });
        },
        { timeout: 10000 },
      );
      await listo;
      const escritura = app.get(EscrituraPedidoService),
        original = escritura.sesion.bind(escritura);
      vi.spyOn(escritura, 'sesion').mockImplementationOnce(async (...args) => {
        iniciado();
        return original(...args);
      });
      const resultado = expect(
        app
          .get(EnviosPedidosService)
          .cambiar(
            p.codigo,
            'PREPARAR',
            { versionPedido: p.version, nota: '' },
            contexto,
          ),
      ).rejects.toMatchObject({ status: 401 });
      try {
        await entrada;
      } finally {
        liberar();
      }
      await bloqueo;
      await resultado;
      expect(await prisma.envioPedido.count()).toBe(0);
    });

    it.each(['preparacion', 'envio'] as const)(
      'impide fechas de %s futuras antes de avanzar',
      async (etapa) => {
        const prep = (await operar(await aprobado(), 'preparacion').expect(200))
          .body.pedido;
        const p =
          etapa === 'envio'
            ? (await operar(prep, 'envio').expect(200)).body.pedido
            : prep;
        const envio = await prisma.envioPedido.findFirstOrThrow();
        const futura = new Date(Date.now() + 3600000);
        await prisma.envioPedido.update({
          where: { id: envio.id },
          data:
            etapa === 'preparacion'
              ? { preparacionIniciadaEn: futura }
              : { despachadoEn: futura },
        });
        await operar(p, etapa === 'preparacion' ? 'envio' : 'entrega').expect(
          409,
        );
        expect(
          (await get(admin, `/api/admin/pedidos/${p.codigo}`).expect(200)).body
            .pedido.version,
        ).toBe(p.version);
      },
    );

    it.each(['movimiento', 'reserva'] as const)(
      'impide entregar con %s inconsistente sin nuevos descuentos',
      async (caso) => {
        const prep = (await operar(await aprobado(), 'preparacion').expect(200))
          .body.pedido;
        const p = (await operar(prep, 'envio').expect(200)).body.pedido;
        const stock = await prisma.variante.findMany({
          where: { id: { in: idsVariantes } },
        });
        if (caso === 'movimiento')
          await prisma.movimientoInventario.deleteMany({
            where: { envioPedido: { pedido: { codigo: p.codigo } } },
          });
        else
          await prisma.reservaInventario.updateMany({
            where: { articulo: { pedido: { codigo: p.codigo } } },
            data: { cantidad: 1 },
          });
        const r = await operar(p, 'entrega').expect(409);
        expect(r.body.codigo).toBe('INVENTARIO_INCONSISTENTE');
        expect(
          (await prisma.envioPedido.findFirstOrThrow()).entregadoEn,
        ).toBeNull();
        expect(
          await prisma.variante.findMany({
            where: { id: { in: idsVariantes } },
          }),
        ).toEqual(stock);
      },
    );

    it('envíos exige ADMIN, origen autorizado y CSRF en las tres rutas', async () => {
      const p = await aprobado();
      for (const accion of ['preparacion', 'envio', 'entrega'] as const) {
        const destino = `/api/admin/pedidos/${p.codigo}/${accion}`;
        await request(app.getHttpServer())
          .post(destino)
          .send({ versionPedido: p.version })
          .expect(401);
        await operar(p, accion, {}, propietario).expect(403);
        await admin.cliente
          .post(destino)
          .set('Origin', origen)
          .send({ versionPedido: p.version })
          .expect(403);
        await admin.cliente
          .post(destino)
          .set('Origin', 'https://ajeno.test')
          .set('X-CSRF-Token', admin.csrf)
          .send({ versionPedido: p.version })
          .expect(403);
      }
      expect(await prisma.envioPedido.count()).toBe(0);
    });

    it('realiza el ciclo de dos SKU, conserva notas privadas y descuenta una sola vez', async () => {
      const p = await aprobado(true);
      const prep = await operar(p, 'preparacion', {
        nota: 'Revisar embalaje privado',
      }).expect(200);
      expect(prep.headers['cache-control']).toBe('no-store');
      expect(prep.body.pedido).toMatchObject({
        estadoEntrega: 'EN_PREPARACION',
        version: p.version + 1,
        responsablesEnvio: { preparacion: { id: idsUsuarios[2] } },
      });
      expect(
        (
          await prisma.variante.findMany({
            where: { id: { in: idsVariantes } },
          })
        ).every((v) => v.existencias === 5 && v.cantidadReservada === 2),
      ).toBe(true);
      const desp = await operar(prep.body.pedido, 'envio', {
        nota: 'Control privado de salida',
      }).expect(200);
      const movimientos = await prisma.movimientoInventario.findMany({
        where: { varianteId: { in: idsVariantes } },
      });
      expect(movimientos).toHaveLength(2);
      expect(
        movimientos.every(
          (m) =>
            m.origen === 'ENVIO_PEDIDO' &&
            m.cantidad === -2 &&
            m.saldoAnterior === 5 &&
            m.saldoPosterior === 3 &&
            m.cantidadReservada === 0 &&
            m.usuarioResponsableId === idsUsuarios[2],
        ),
      ).toBe(true);
      const publico = await get(propietario, `${ruta}/${p.codigo}`).expect(200);
      expect(publico.body.pedido.envio).toMatchObject({
        transportista: 'SOHO reparto',
        referenciaSeguimiento: '000123',
        entregadoEn: null,
      });
      expect(JSON.stringify(publico.body)).not.toMatch(
        /privado|responsablesEnvio|preparacionIniciadaPorId|despachadoPorId/,
      );
      expect(desp.body.pedido.eventosInternos).toHaveLength(2);
      await operar(prep.body.pedido, 'envio').expect(409);
      await operar(desp.body.pedido, 'envio').expect(409);
      await prisma.variante.updateMany({
        where: { id: { in: idsVariantes } },
        data: { existencias: 1 },
      });
      const entrega = await operar(desp.body.pedido, 'entrega').expect(200);
      expect(entrega.body.pedido).toMatchObject({
        estadoEntrega: 'ENTREGADO',
        pago: { estado: 'APROBADO', version: p.pago!.version },
        envio: { despachadoEn: desp.body.pedido.envio.despachadoEn },
      });
      await operar(desp.body.pedido, 'entrega').expect(409);
      expect(
        await prisma.movimientoInventario.findMany({
          where: { varianteId: { in: idsVariantes } },
        }),
      ).toEqual(movimientos);
      expect(
        (
          await prisma.variante.findMany({
            where: { id: { in: idsVariantes } },
          })
        ).every((v) => v.existencias === 1 && v.cantidadReservada === 0),
      ).toBe(true);
      const historial = await prisma.eventoPedido.findMany({
        where: { pedido: { codigo: p.codigo } },
        orderBy: { secuencia: 'asc' },
      });
      expect(new Set(historial.map((e) => e.secuencia)).size).toBe(
        historial.length,
      );
      expect(
        historial
          .filter((e) =>
            ['ENTREGA_CAMBIADA', 'RESERVA_CONSUMIDA', 'NOTA_INTERNA'].includes(
              e.tipo,
            ),
          )
          .every(
            (e) => e.actor === 'ADMIN' && e.responsableId === idsUsuarios[2],
          ),
      ).toBe(true);
    });

    it.each(['PENDIENTE', 'OBSERVADO', 'RECHAZADO'] as const)(
      'no prepara un pago %s',
      async (estado) => {
        const p = (await enviar(propietario, await nuevo()).expect(201)).body
          .pedido as PedidoRevision;
        const actual =
          estado === 'PENDIENTE'
            ? p
            : (await revisar(admin, p, estado).expect(201)).body.pedido;
        await operar(actual, 'preparacion').expect(409);
        expect(await prisma.envioPedido.count()).toBe(0);
      },
    );

    it('impide saltos de etapa, versiones viejas, metadatos falsos y entregas sin confirmar', async () => {
      const p = await aprobado();
      await operar(p, 'envio').expect(409);
      await operar(p, 'entrega').expect(409);
      await operar(p, 'preparacion', { versionPedido: p.version - 1 }).expect(
        409,
      );
      await operar(p, 'preparacion', { responsableId: idsUsuarios[0] }).expect(
        400,
      );
      const prep = (await operar(p, 'preparacion').expect(200)).body.pedido;
      await operar(prep, 'envio', {
        transportista: '',
        referenciaSeguimiento: '12',
      }).expect(400);
      const desp = (await operar(prep, 'envio').expect(200)).body.pedido;
      await operar(desp, 'entrega', { confirmado: false }).expect(400);
      await operar({ ...p, codigo: 'SOHO-NOEXISTENTE' }, 'preparacion').expect(
        404,
      );
    });

    it.each(['CANCELADO', 'INCIDENCIA', 'PENDIENTE'] as const)(
      'bloquea preparación en estado %s aunque el pago esté aprobado',
      async (estadoEntrega) => {
        const p = await aprobado();
        await prisma.pedido.update({
          where: { codigo: p.codigo },
          data: { estadoEntrega },
        });
        await operar(p, 'preparacion').expect(409);
      },
    );

    it('dos preparaciones simultáneas crean un solo envío', async () => {
      const p = await aprobado();
      await prisma.usuario.update({
        where: { id: idsUsuarios[1] },
        data: { rol: 'ADMIN' },
      });
      const rs = await Promise.all([
        operar(p, 'preparacion'),
        operar(p, 'preparacion', {}, otro),
      ]);
      expect(rs.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect(await prisma.envioPedido.count()).toBe(1);
      expect(await prisma.movimientoInventario.count()).toBe(0);
    });

    it('dos despachos simultáneos consumen una sola reserva y un movimiento por SKU', async () => {
      const p = (await operar(await aprobado(true), 'preparacion').expect(200))
        .body.pedido;
      await prisma.usuario.update({
        where: { id: idsUsuarios[1] },
        data: { rol: 'ADMIN' },
      });
      const rs = await Promise.all([
        operar(p, 'envio'),
        operar(p, 'envio', {}, otro),
      ]);
      expect(rs.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect(await prisma.movimientoInventario.count()).toBe(2);
      expect(
        await prisma.reservaInventario.count({
          where: { estado: 'CONSUMIDA' },
        }),
      ).toBe(2);
    });

    it('serializa dos pedidos con reservas de las mismas variantes sin tomar unidades ajenas', async () => {
      const a = (await operar(await aprobado(true), 'preparacion').expect(200))
        .body.pedido;
      const b = (await operar(await aprobado(true), 'preparacion').expect(200))
        .body.pedido;
      await prisma.usuario.update({
        where: { id: idsUsuarios[1] },
        data: { rol: 'ADMIN' },
      });
      const rs = await Promise.all([
        operar(a, 'envio'),
        operar(b, 'envio', {}, otro),
      ]);
      expect(rs.map((r) => r.status)).toEqual([200, 200]);
      expect(await prisma.movimientoInventario.count()).toBe(4);
      expect(
        (
          await prisma.variante.findMany({
            where: { id: { in: idsVariantes } },
          })
        ).every((v) => v.existencias === 1 && v.cantidadReservada === 0),
      ).toBe(true);
    });

    it('bloquea el despacho cuando el stock físico no cubre todas las reservas', async () => {
      const p = (await operar(await aprobado(), 'preparacion').expect(200)).body
        .pedido;
      await aprobado();
      await prisma.variante.update({
        where: { id: idsVariantes[0] },
        data: { existencias: 3 },
      });
      const r = await operar(p, 'envio').expect(409);
      expect(r.body.codigo).toBe('INVENTARIO_INCONSISTENTE');
      expect(await prisma.movimientoInventario.count()).toBe(0);
      expect(
        await prisma.reservaInventario.count({ where: { estado: 'ACTIVA' } }),
      ).toBe(2);
      expect(
        (await get(admin, `/api/admin/pedidos/${p.codigo}`).expect(200)).body
          .pedido.estadoEntrega,
      ).toBe('EN_PREPARACION');
    });

    it.each(['contador', 'cantidad', 'liberada'] as const)(
      'rechaza reservas inconsistentes por %s sin salidas parciales',
      async (caso) => {
        const p = (
          await operar(await aprobado(true), 'preparacion').expect(200)
        ).body.pedido;
        if (caso === 'contador')
          await prisma.variante.update({
            where: { id: idsVariantes[1] },
            data: { cantidadReservada: 3 },
          });
        else {
          const r = await prisma.reservaInventario.findFirstOrThrow({
            where: { articulo: { varianteId: idsVariantes[1] } },
          });
          await prisma.reservaInventario.update({
            where: { id: r.id },
            data:
              caso === 'cantidad'
                ? { cantidad: 1 }
                : {
                    estado: 'LIBERADA',
                    cerradaEn: new Date(),
                    motivoCierre: 'Prueba de inconsistencia',
                  },
          });
        }
        await operar(p, 'envio').expect(409);
        expect(await prisma.movimientoInventario.count()).toBe(0);
        expect(
          (await prisma.envioPedido.findFirstOrThrow()).despachadoEn,
        ).toBeNull();
        expect(
          (
            await prisma.variante.findMany({
              where: { id: { in: idsVariantes } },
            })
          ).every((v) => v.existencias === 5),
        ).toBe(true);
      },
    );

    it('conserva reservas aprobadas aunque pase su vencimiento y no recotiza ni revalida el catálogo', async () => {
      const p = await aprobado();
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
      await prisma.zonaEntrega.update({
        where: { codigo: 'la-esperanza' },
        data: {
          habilitada: false,
          plazo: 'Plazo cambiado después de la compra',
        },
      });
      await prisma.producto.update({
        where: { id: productoId },
        data: { estado: 'BORRADOR', precio: '199.99' },
      });
      await prisma.variante.updateMany({
        where: { id: { in: idsVariantes } },
        data: { habilitada: false },
      });
      const prep = (await operar(p, 'preparacion').expect(200)).body.pedido;
      const desp = (await operar(prep, 'envio').expect(200)).body.pedido;
      expect(desp).toMatchObject({
        total: p.total,
        costoEnvio: p.costoEnvio,
        entrega: p.entrega,
        articulos: p.articulos.map((a) => ({
          sku: a.sku,
          precioUnitario: a.precioUnitario,
        })),
      });
    });

    it('revierte envío, reservas, stock e historial si falla el segundo movimiento', async () => {
      const p = (await operar(await aprobado(true), 'preparacion').expect(200))
        .body.pedido;
      const escritura = app.get(EscrituraPedidoService),
        original = escritura.transaccion.bind(escritura);
      vi.spyOn(escritura, 'transaccion').mockImplementationOnce((operacion) =>
        original(async (tx) => {
          const crear = tx.movimientoInventario.create.bind(
            tx.movimientoInventario,
          );
          let n = 0;
          vi.spyOn(tx.movimientoInventario, 'create').mockImplementation(
            (...args) => {
              if (++n === 2)
                throw Error('Fallo sintético del segundo movimiento');
              return Reflect.apply(crear, tx.movimientoInventario, args);
            },
          );
          return operacion(tx);
        }),
      );
      await expect(
        app.get(EnviosPedidosService).cambiar(
          p.codigo,
          'ENVIAR',
          {
            versionPedido: p.version,
            nota: '',
            transportista: 'SOHO',
            referenciaSeguimiento: '001',
          },
          await contextoAdmin(),
        ),
      ).rejects.toThrow('segundo movimiento');
      expect(await prisma.movimientoInventario.count()).toBe(0);
      expect(
        await prisma.reservaInventario.count({ where: { estado: 'ACTIVA' } }),
      ).toBe(2);
      expect(
        (await prisma.envioPedido.findFirstOrThrow()).despachadoEn,
      ).toBeNull();
      expect(
        (
          await prisma.variante.findMany({
            where: { id: { in: idsVariantes } },
          })
        ).every((v) => v.existencias === 5 && v.cantidadReservada === 2),
      ).toBe(true);
      expect(
        await prisma.eventoPedido.count({
          where: { tipo: 'RESERVA_CONSUMIDA' },
        }),
      ).toBe(0);
    });

    it.each(['revocada', 'degradada', 'inactiva'] as const)(
      'revalida dentro de la transacción una sesión %s',
      async (caso) => {
        const p = await aprobado(),
          contexto = await contextoAdmin();
        if (caso === 'revocada')
          await prisma.sesion.update({
            where: { id: contexto.sesionId },
            data: { revocadaEn: new Date() },
          });
        else
          await prisma.usuario.update({
            where: { id: idsUsuarios[2] },
            data: caso === 'degradada' ? { rol: 'CLIENTE' } : { activo: false },
          });
        await expect(
          app
            .get(EnviosPedidosService)
            .cambiar(
              p.codigo,
              'PREPARAR',
              { versionPedido: p.version, nota: '' },
              contexto,
            ),
        ).rejects.toMatchObject({ status: 401 });
        expect(await prisma.envioPedido.count()).toBe(0);
      },
    );

    it('recupera por GET un despacho confirmado aunque se pierda la respuesta del COMMIT', async () => {
      const p = (await operar(await aprobado(), 'preparacion').expect(200)).body
        .pedido;
      const original = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementationOnce(
        async (...args) => {
          await Reflect.apply(original, prisma, args);
          throw Error('Respuesta perdida después de COMMIT');
        },
      );
      await expect(
        app.get(EnviosPedidosService).cambiar(
          p.codigo,
          'ENVIAR',
          {
            versionPedido: p.version,
            nota: '',
            transportista: 'SOHO',
            referenciaSeguimiento: '001',
          },
          await contextoAdmin(),
        ),
      ).rejects.toThrow('después de COMMIT');
      const actual = (
        await get(admin, `/api/admin/pedidos/${p.codigo}`).expect(200)
      ).body.pedido;
      expect(actual.estadoEntrega).toBe('ENVIADO');
      await operar(p, 'envio').expect(409);
      expect(await prisma.movimientoInventario.count()).toBe(1);
      expect(
        (
          await prisma.variante.findUniqueOrThrow({
            where: { id: idsVariantes[0] },
          })
        ).existencias,
      ).toBe(3);
    });
    const correccion = (
      p: PedidoRevision,
      comprobante: Awaited<ReturnType<typeof nuevo>>['comprobante'],
    ) => ({
      versionPedido: p.version,
      versionPago: p.pago.version,
      comprobanteId: p.pago.comprobantes.at(-1)!.id,
      comprobante,
    });
    const corregir = (n: Navegador, codigo: string, cuerpo: object) => {
      const r = n.cliente
        .post(`${ruta}/${codigo}/comprobantes`)
        .set('Origin', origen)
        .set('X-CSRF-Token', n.csrf);
      if (n.acceso) r.set('X-Pedido-Acceso', n.acceso);
      return r.send(cuerpo);
    };
    it('protege administración con ADMIN y CSRF; conserva privado el archivo', async () => {
      const p = (await enviar(propietario, await nuevo()).expect(201)).body
        .pedido as PedidoRevision;
      await request(app.getHttpServer()).get('/api/admin/pagos').expect(401);
      await get(propietario, '/api/admin/pagos').expect(403);
      await revisar(propietario, p).expect(403);
      await admin.cliente
        .post(`/api/admin/pagos/${p.codigo}/decision`)
        .set('Origin', origen)
        .send(decision(p))
        .expect(403);
      const listado = await get(
        admin,
        '/api/admin/pagos?estado=PENDIENTE&limite=1',
      ).expect(200);
      expect(listado.headers['cache-control']).toBe('no-store');
      expect(listado.body.paginacion.total).toBe(1);
      expect(JSON.stringify(listado.body)).not.toMatch(
        /archivoClave|archivoSha256|accesoInvitadoHash|claveHash/,
      );
      await get(admin, `/api/admin/pagos/${p.codigo}`).expect(200);
      await get(
        admin,
        `${ruta}/${p.codigo}/comprobantes/${p.pago.comprobantes[0].id}`,
      ).expect(200);
    });
    it('aprobar confirma y registra revisor real sin descontar ni liberar inventario', async () => {
      const p = (await enviar(propietario, await nuevo()).expect(201)).body
        .pedido as PedidoRevision;
      const aprobado = await revisar(admin, p).expect(201);
      expect(aprobado.body.pedido).toMatchObject({
        version: 2,
        estadoEntrega: 'CONFIRMADO',
        pago: { estado: 'APROBADO', version: 2 },
      });
      const c = await prisma.comprobantePago.findUniqueOrThrow({
        where: { id: p.pago.comprobantes[0].id },
      });
      expect(c.revisadoPorId).toBe(idsUsuarios[2]);
      expect(c.mensaje).toBeNull();
      expect(
        await prisma.variante.findUnique({ where: { sku } }),
      ).toMatchObject({ existencias: 5, cantidadReservada: 2 });
      expect(await prisma.reservaInventario.findMany()).toHaveLength(1);
      await revisar(admin, p).expect(409);
      expect(
        await prisma.eventoPedido.count({ where: { tipo: 'PAGO_APROBADO' } }),
      ).toBe(1);
    });
    it('serializa dos decisiones sobre la misma versión y aplica solo una', async () => {
      const p = (await enviar(propietario, await nuevo()).expect(201)).body
        .pedido as PedidoRevision;
      const r = await Promise.all([
        revisar(admin, p),
        revisar(admin, p, 'RECHAZADO'),
      ]);
      expect(r.map((v) => v.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(
        await prisma.eventoPedido.count({
          where: { tipo: { in: ['PAGO_APROBADO', 'PAGO_RECHAZADO'] } },
        }),
      ).toBe(1);
    });
    it('rechazar libera reservas una sola vez sin cancelar ni reembolsar', async () => {
      const p = (await enviar(propietario, await nuevo()).expect(201)).body
        .pedido as PedidoRevision;
      const r = await revisar(admin, p, 'RECHAZADO').expect(201);
      expect(r.body.pedido).toMatchObject({
        estadoEntrega: 'PENDIENTE',
        pago: { estado: 'RECHAZADO' },
      });
      expect(
        await prisma.variante.findUnique({ where: { sku } }),
      ).toMatchObject({ existencias: 5, cantidadReservada: 0 });
      expect(await prisma.reservaInventario.findFirst()).toMatchObject({
        estado: 'LIBERADA',
        motivoCierre: 'Pago rechazado',
      });
      await revisar(admin, p, 'RECHAZADO').expect(409);
      expect(
        await prisma.eventoPedido.count({
          where: { tipo: 'RESERVA_LIBERADA' },
        }),
      ).toBe(1);
    });
    it.each(['cuenta', 'invitado'])(
      'observa, corrige y aprueba para %s conservando historia y reservas',
      async (tipo) => {
        const n = tipo === 'cuenta' ? propietario : await invitado(),
          d = await nuevo();
        const p = (await enviar(n, d).expect(201)).body
          .pedido as PedidoRevision;
        const observado = (await revisar(admin, p, 'OBSERVADO').expect(201))
          .body.pedido as PedidoRevision;
        const cuerpo = correccion(observado, d.comprobante);
        await corregir(otro, p.codigo, cuerpo).expect(404);
        await corregir(admin, p.codigo, cuerpo).expect(404);
        const corregido = await corregir(n, p.codigo, cuerpo).expect(201);
        expect(corregido.body.pedido.pago.estado).toBe('PENDIENTE');
        expect(corregido.body.pedido.pago.comprobantes).toHaveLength(2);
        expect(corregido.body.pedido.pago.comprobantes[0].estadoRevision).toBe(
          'OBSERVADO',
        );
        const actual = (
          await get(admin, `/api/admin/pagos/${p.codigo}`).expect(200)
        ).body.pedido as PedidoRevision;
        await revisar(admin, observado).expect(409);
        await revisar(admin, actual).expect(201);
        const replay = await corregir(n, p.codigo, cuerpo).expect(201);
        expect(replay.body.reutilizado).toBe(true);
        expect(await prisma.comprobantePago.count()).toBe(2);
        expect(
          await prisma.variante.findUnique({ where: { sku } }),
        ).toMatchObject({ existencias: 5, cantidadReservada: 2 });
        expect(
          await prisma.eventoPedido.count({
            where: { tipo: 'COMPROBANTE_ADJUNTADO' },
          }),
        ).toBe(2);
      },
    );
    it('dos correcciones simultáneas iguales no duplican versiones ni archivos persistidos', async () => {
      const n = await invitado(),
        d = await nuevo(),
        p = (await enviar(n, d).expect(201)).body.pedido as PedidoRevision;
      const observado = (await revisar(admin, p, 'OBSERVADO').expect(201)).body
        .pedido as PedidoRevision;
      const antes = (await archivos()).length;
      const r = await Promise.all([
        corregir(n, p.codigo, correccion(observado, d.comprobante)),
        corregir(n, p.codigo, correccion(observado, d.comprobante)),
      ]);
      expect(r.map((v) => v.status)).toEqual([201, 201]);
      expect(
        r.map((v) => v.body.reutilizado).sort((a, b) => Number(a) - Number(b)),
      ).toEqual([false, true]);
      expect(await prisma.comprobantePago.count()).toBe(2);
      expect((await archivos()).length).toBe(antes + 1);
    });
    it('bloquea pedidos cancelados, correcciones no observadas e imágenes inválidas', async () => {
      const d = await nuevo(),
        p = (await enviar(propietario, d).expect(201)).body
          .pedido as PedidoRevision;
      await corregir(
        propietario,
        p.codigo,
        correccion(p, d.comprobante),
      ).expect(409);
      const observado = (await revisar(admin, p, 'OBSERVADO').expect(201)).body
        .pedido as PedidoRevision;
      const antes = (await archivos()).length;
      await corregir(
        propietario,
        p.codigo,
        correccion(observado, {
          ...d.comprobante,
          contenidoBase64: Buffer.from('imagen falsa').toString('base64'),
        }),
      ).expect(400);
      expect((await archivos()).length).toBe(antes);
      await prisma.pedido.update({
        where: { codigo: p.codigo },
        data: { estadoEntrega: 'CANCELADO' },
      });
      await corregir(
        propietario,
        p.codigo,
        correccion(observado, d.comprobante),
      ).expect(409);
      await revisar(admin, p).expect(409);
    });
    it('no confirma reservas vencidas que requieren liberar ni inventarios incoherentes', async () => {
      const p = (await enviar(propietario, await nuevo()).expect(201)).body
        .pedido as PedidoRevision;
      await prisma.reservaInventario.updateMany({
        data: {
          estado: 'LIBERADA',
          cerradaEn: new Date(),
          motivoCierre: 'Prueba de reserva vencida',
        },
      });
      await revisar(admin, p).expect(409);
      expect(await prisma.pagoPedido.findFirst()).toMatchObject({
        estado: 'PENDIENTE',
        version: 1,
      });
    });
    it('lista y resume importes por aprobación en hora de Lima, sin sumar pendientes', async () => {
      const d = await nuevo(),
        p = (await enviar(propietario, d).expect(201)).body
          .pedido as PedidoRevision;
      const segundo = await nuevo();
      segundo.articulos = [{ ...d.articulos[0], cantidad: 1 }];
      segundo.cotizacion = { ...d.cotizacion, total: '99.99' };
      await enviar(otro, segundo).expect(201);
      await revisar(admin, p).expect(201);
      const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
      const r = await get(
        admin,
        `/api/admin/resumen-pedidos?desde=${hoy}&hasta=${hoy}`,
      ).expect(200);
      expect(r.body.conteos).toMatchObject({ PENDIENTE: 1, APROBADO: 1 });
      expect(r.body.ventas).toEqual([
        { dia: hoy, importe: 199.98, pedidos: 1 },
      ]);
      expect(r.body.importePendiente).toBe('99.99');
      const lista = await get(
        admin,
        '/api/admin/pedidos?entrega=POR_PREPARAR',
      ).expect(200);
      expect(lista.body.paginacion.total).toBe(1);
      await get(admin, '/api/admin/pedidos?desde=2026-99-99').expect(400);
      await get(
        admin,
        '/api/admin/resumen-pedidos?desde=ayer&hasta=hoy',
      ).expect(400);
    });
    it('revierte la decisión completa si el contador reservado no permite liberar', async () => {
      const p = (await enviar(propietario, await nuevo()).expect(201)).body
        .pedido as PedidoRevision;
      await prisma.variante.update({
        where: { sku },
        data: { cantidadReservada: 0 },
      });
      await revisar(admin, p, 'RECHAZADO').expect(409);
      expect(await prisma.pagoPedido.findFirst()).toMatchObject({
        estado: 'PENDIENTE',
        version: 1,
      });
      expect(await prisma.comprobantePago.findFirst()).toMatchObject({
        estadoRevision: 'PENDIENTE',
        revisadoPorId: null,
      });
      expect(await prisma.reservaInventario.findFirst()).toMatchObject({
        estado: 'ACTIVA',
      });
      expect(
        await prisma.eventoPedido.count({ where: { tipo: 'PAGO_RECHAZADO' } }),
      ).toBe(0);
    });
    it('revalida la sesión después de procesar una imagen corregida y limpia el archivo si fue revocada', async () => {
      const d = await nuevo(),
        p = (await enviar(propietario, d).expect(201)).body
          .pedido as PedidoRevision;
      const observado = (await revisar(admin, p, 'OBSERVADO').expect(201)).body
        .pedido as PedidoRevision;
      const archivosService = app.get(ComprobantesPrivadosService),
        original = archivosService.preparar.bind(archivosService),
        antes = (await archivos()).length;
      vi.spyOn(archivosService, 'preparar').mockImplementationOnce(
        async (...args) => {
          const r = await original(...args);
          await prisma.sesion.updateMany({
            where: { usuarioId: idsUsuarios[0] },
            data: { revocadaEn: new Date() },
          });
          return r;
        },
      );
      await corregir(
        propietario,
        p.codigo,
        correccion(observado, d.comprobante),
      ).expect(401);
      expect(await prisma.comprobantePago.count()).toBe(1);
      expect((await archivos()).length).toBe(antes);
      expect(await prisma.pagoPedido.findFirst()).toMatchObject({
        estado: 'OBSERVADO',
        version: 2,
      });
    });
    it('una credencial de invitado vencida no permite corregir un pago observado', async () => {
      const n = await invitado(),
        d = await nuevo(),
        p = (await enviar(n, d).expect(201)).body.pedido as PedidoRevision;
      const observado = (await revisar(admin, p, 'OBSERVADO').expect(201)).body
        .pedido as PedidoRevision;
      const registro = await prisma.pedido.findUniqueOrThrow({
        where: { codigo: p.codigo },
      });
      await prisma.pedido.update({
        where: { id: registro.id },
        data: {
          accesoInvitadoExpiraEn: new Date(registro.creadoEn.getTime() + 1),
        },
      });
      await corregir(n, p.codigo, correccion(observado, d.comprobante)).expect(
        404,
      );
      expect(await prisma.comprobantePago.count()).toBe(1);
    });
    it('recupera el COMMIT de una corrección y conserva el archivo privado', async () => {
      const n = await invitado(),
        d = await nuevo(),
        p = (await enviar(n, d).expect(201)).body.pedido as PedidoRevision;
      const observado = (await revisar(admin, p, 'OBSERVADO').expect(201)).body
        .pedido as PedidoRevision;
      const original = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementationOnce(
        async (...args) => {
          await Reflect.apply(original, prisma, args);
          throw Error('Respuesta perdida');
        },
      );
      const r = await app
        .get(PagosPedidosService)
        .corregir(p.codigo, correccion(observado, d.comprobante), {
          accesoInvitadoHash: createHash('sha256')
            .update(n.acceso!)
            .digest('hex'),
        });
      expect(r.reutilizado).toBe(true);
      expect(await prisma.comprobantePago.count()).toBe(2);
      await get(n, r.pedido.pago!.comprobantes.at(-1)!.ruta).expect(200);
    });
    it('recupera un COMMIT cuya respuesta se perdió y conserva su comprobante', async () => {
      const n = await invitado(),
        d = await nuevo();
      const original = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementationOnce(
        async (...args) => {
          await Reflect.apply(original, prisma, args);
          throw Error('Respuesta perdida después del COMMIT');
        },
      );
      const resultado = await app.get(PedidosService).crear(d, {
        accesoInvitadoHash: createHash('sha256')
          .update(n.acceso!)
          .digest('hex'),
      });
      expect(resultado.reutilizado).toBe(true);
      expect(await pedidosPropios()).toHaveLength(1);
      await get(n, resultado.pedido.pago!.comprobantes[0].ruta).expect(200);
    });
  },
);
