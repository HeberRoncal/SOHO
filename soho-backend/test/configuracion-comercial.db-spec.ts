import { randomUUID } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw Error(
    'Configuración comercial requiere TEST_DATABASE_URL local con sufijo _test.',
  );
const destino = new URL(obtenerUrlBaseDatos(url));
if (
  !['localhost', '127.0.0.1'].includes(destino.hostname) ||
  !destino.pathname.endsWith('_test')
)
  throw Error(
    'Configuración comercial solo usa MySQL temporal local con sufijo _test.',
  );
const prisma = crearClientePrisma(url),
  rollback = Symbol('rollback comercial');
const enlaces = [
  { texto: 'Ayuda', url: null },
  { texto: 'Cambios', url: 'https://soho.example/ayuda' },
];

async function fixture(tx: Prisma.TransactionClient) {
  const admin = await tx.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Comercial',
      rol: 'ADMIN',
      correo: randomUUID() + '@comercial.test',
    },
  });
  const cliente = await tx.usuario.create({
    data: {
      nombres: 'Cliente',
      apellidos: 'Comercial',
      correo: randomUUID() + '@comercial.test',
    },
  });
  const ahora = new Date();
  const qr = await tx.archivoQrPago.create({
    data: {
      metodo: 'YAPE',
      estado: 'DISPONIBLE',
      claveCarga: randomUUID(),
      solicitudHash: 'a'.repeat(64),
      hashContenido: 'b'.repeat(64),
      cloudName: 'sintetico',
      publicId: randomUUID(),
      assetId: randomUUID(),
      versionCloudinary: 1n,
      urlEntrega: 'https://res.cloudinary.com/sintetico/image/upload/v1/qr.png',
      carpetaCloudinary: 'SOHO/pagos/yape/' + randomUUID(),
      nombreOriginal: 'qr.png',
      formato: 'png',
      ancho: 256,
      alto: 256,
      bytes: 1024,
      creadoPorId: admin.id,
      creadoEn: ahora,
      confirmadoEn: ahora,
    },
  });
  const version = await tx.versionConfiguracionPagos.create({
    data: {
      numero: 1,
      claveSolicitud: randomUUID(),
      solicitudHash: 'c'.repeat(64),
      respuesta: { version: 1 },
      responsableId: admin.id,
    },
  });
  const metodo = await tx.metodoPagoConfigurado.create({
    data: {
      versionId: version.id,
      metodo: 'YAPE',
      activo: true,
      celular: '987654321',
      titular: 'SOHO Prueba',
      archivoQrId: qr.id,
    },
  });
  await tx.metodoPagoConfigurado.create({
    data: { versionId: version.id, metodo: 'PLIN' },
  });
  const tienda = await tx.versionConfiguracionTienda.create({
    data: {
      numero: 1,
      claveSolicitud: randomUUID(),
      solicitudHash: 'd'.repeat(64),
      respuesta: { version: 1 },
      responsableId: admin.id,
      enlaces,
      cambios: 'Primera línea\nSegunda línea con tildes y ñ.',
      privacidad: null,
      terminos: null,
    },
  });
  const instruccion = await tx.instruccionPago.create({
    data: {
      metodoConfiguradoId: metodo.id,
      metodo: 'YAPE',
      claveSolicitud: randomUUID(),
      solicitudHash: 'e'.repeat(64),
      preparacionHash: 'f'.repeat(64),
      claveCreacionPedido: randomUUID(),
      usuarioId: cliente.id,
      importeReferencia: '105.99',
      respuesta: {
        destino: { celular: metodo.celular, titular: metodo.titular },
      },
    },
  });
  return { admin, cliente, qr, version, metodo, tienda, instruccion };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function aislado(
  comprobar: (tx: Prisma.TransactionClient, f: F) => Promise<void>,
) {
  await expect(
    prisma.$transaction(
      async (tx) => {
        const f = await fixture(tx);
        await comprobar(tx, f);
        throw rollback;
      },
      { timeout: 30000 },
    ),
  ).rejects.toBe(rollback);
}
async function pedido(
  tx: Prisma.TransactionClient,
  f: F,
  clave: string = randomUUID(),
) {
  return tx.pedido.create({
    data: {
      codigo:
        'SOHO-' + randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
      claveCreacion: clave,
      solicitudHash: 'a'.repeat(64),
      usuarioId: f.cliente.id,
      nombres: 'Cliente',
      apellidos: 'Anterior',
      correo: 'compra@comercial.test',
      destinatario: 'Otra Persona',
      celular: '987654321',
      distritoCodigo: 'moche',
      distritoNombre: 'Moche',
      direccion: 'Av. Prueba 123',
      subtotal: '99.99',
      costoEnvio: '6.00',
      total: '105.99',
    },
  });
}

describe.sequential(
  'Esquema de configuración comercial en MySQL temporal',
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it('inicia sin publicación ni datos bancarios ficticios', async () => {
      expect(
        await prisma.configuracionPagos.findUnique({ where: { id: 1 } }),
      ).toMatchObject({ versionActualId: null });
      expect(
        await prisma.configuracionTienda.findUnique({ where: { id: 1 } }),
      ).toMatchObject({ versionActualId: null });
      expect(await prisma.versionConfiguracionPagos.count()).toBe(0);
      expect(await prisma.versionConfiguracionTienda.count()).toBe(0);
    });
    it.each(['configuracion_pagos', 'configuracion_tienda'])(
      'impide una segunda fila de control en %s',
      async (tabla) => {
        await aislado(async (tx) => {
          await expect(
            tx.$executeRaw(
              Prisma.sql`INSERT INTO ${Prisma.raw(tabla)} (id) VALUES (2)`,
            ),
          ).rejects.toThrow();
        });
      },
    );
    it('permite método activo por número y titular sin obligar QR', async () => {
      await aislado(async (tx, f) => {
        const m = await tx.metodoPagoConfigurado.update({
          where: { id: f.metodo.id },
          data: { archivoQrId: null },
        });
        expect(m).toMatchObject({
          activo: true,
          celular: '987654321',
          archivoQrId: null,
        });
      });
    });
    it('mantiene dos publicaciones y un destino antiguo tras cambiar los punteros vigentes', async () => {
      await aislado(async (tx, f) => {
        await tx.configuracionPagos.update({
          where: { id: 1 },
          data: { versionActualId: f.version.id },
        });
        await tx.configuracionTienda.update({
          where: { id: 1 },
          data: { versionActualId: f.tienda.id },
        });
        const siguiente = await tx.versionConfiguracionPagos.create({
          data: {
            numero: 2,
            claveSolicitud: randomUUID(),
            solicitudHash: 'a'.repeat(64),
            respuesta: { version: 2 },
            responsableId: f.admin.id,
            metodos: {
              create: [
                { metodo: 'YAPE', activo: false },
                { metodo: 'PLIN', activo: false },
              ],
            },
          },
        });
        await tx.configuracionPagos.update({
          where: { id: 1 },
          data: { versionActualId: siguiente.id },
        });
        const i = await tx.instruccionPago.findUniqueOrThrow({
          where: { id: f.instruccion.id },
          include: {
            metodoConfigurado: { include: { archivoQr: true, version: true } },
          },
        });
        expect(i.metodoConfigurado).toMatchObject({
          celular: '987654321',
          titular: 'SOHO Prueba',
          version: { numero: 1 },
          archivoQr: { id: f.qr.id },
        });
        expect(
          (await tx.configuracionTienda.findUniqueOrThrow({ where: { id: 1 } }))
            .versionActualId,
        ).toBe(f.tienda.id);
        expect(
          (
            await tx.versionConfiguracionPagos.findUniqueOrThrow({
              where: { claveSolicitud: f.version.claveSolicitud },
            })
          ).respuesta,
        ).toEqual({ version: 1 });
      });
    });
    it('conserva textos planos, pendientes y dos enlaces sin alterar Pagos', async () => {
      await aislado(async (tx, f) => {
        const v = await tx.versionConfiguracionTienda.findUniqueOrThrow({
          where: { id: f.tienda.id },
        });
        expect(v.cambios).toBe('Primera línea\nSegunda línea con tildes y ñ.');
        expect(v.correo).toBeNull();
        expect(v.enlaces).toEqual(enlaces);
        expect(
          (await tx.configuracionPagos.findUniqueOrThrow({ where: { id: 1 } }))
            .versionActualId,
        ).toBeNull();
      });
    });
    it('vincula instrucción, pedido y método con sus referencias compuestas', async () => {
      await aislado(async (tx, f) => {
        const p = await pedido(tx, f, f.instruccion.claveCreacionPedido);
        await tx.instruccionPago.update({
          where: { id: f.instruccion.id },
          data: { pedidoId: p.id },
        });
        const pago = await tx.pagoPedido.create({
          data: {
            pedidoId: p.id,
            metodo: 'YAPE',
            instruccionId: f.instruccion.id,
          },
        });
        expect(pago.estado).toBe('PENDIENTE');
        expect(
          (
            await tx.instruccionPago.findUniqueOrThrow({
              where: { id: f.instruccion.id },
              include: { pago: true, pedido: true },
            })
          ).pago?.id,
        ).toBe(pago.id);
      });
    });
    it('admite múltiples pagos anteriores sin instrucciones reconstruidas', async () => {
      await aislado(async (tx, f) => {
        for (const metodo of ['YAPE', 'PLIN'] as const) {
          const p = await pedido(tx, f);
          expect(
            (
              await tx.pagoPedido.create({
                data: { pedidoId: p.id, metodo, estado: 'APROBADO' },
              })
            ).instruccionId,
          ).toBeNull();
        }
      });
    });
    it('permite varias instrucciones de un checkout antes de elegir la que se vincula', async () => {
      await aislado(async (tx, f) => {
        const { id, claveSolicitud, ...datos } = f.instruccion;
        expect(id).toBeTruthy();
        expect(claveSolicitud).toBeTruthy();
        const otro = await tx.instruccionPago.create({
          data: { ...datos, respuesta: {}, claveSolicitud: randomUUID() },
        });
        expect(otro.claveCreacionPedido).toBe(
          f.instruccion.claveCreacionPedido,
        );
        expect(otro.pedidoId).toBeNull();
      });
    });
    it.each([
      'clave-pagos',
      'numero-pagos',
      'clave-tienda',
      'numero-tienda',
      'metodo-version',
      'clave-carga',
      'asset',
      'recurso',
      'clave-instruccion',
    ])('rechaza duplicados de %s', async (caso) => {
      await aislado(async (tx, f) => {
        if (caso === 'clave-pagos' || caso === 'numero-pagos')
          await expect(
            tx.versionConfiguracionPagos.create({
              data: {
                numero: caso === 'numero-pagos' ? 1 : 2,
                claveSolicitud:
                  caso === 'clave-pagos'
                    ? f.version.claveSolicitud
                    : randomUUID(),
                solicitudHash: 'a'.repeat(64),
                respuesta: {},
                responsableId: f.admin.id,
              },
            }),
          ).rejects.toThrow();
        if (caso === 'clave-tienda' || caso === 'numero-tienda')
          await expect(
            tx.versionConfiguracionTienda.create({
              data: {
                numero: caso === 'numero-tienda' ? 1 : 2,
                claveSolicitud:
                  caso === 'clave-tienda'
                    ? f.tienda.claveSolicitud
                    : randomUUID(),
                solicitudHash: 'a'.repeat(64),
                respuesta: {},
                responsableId: f.admin.id,
                enlaces,
              },
            }),
          ).rejects.toThrow();
        if (caso === 'metodo-version')
          await expect(
            tx.metodoPagoConfigurado.create({
              data: { versionId: f.version.id, metodo: 'YAPE' },
            }),
          ).rejects.toThrow();
        if (['clave-carga', 'asset', 'recurso'].includes(caso)) {
          const { id, ...datos } = f.qr;
          expect(id).toBeTruthy();
          await expect(
            tx.archivoQrPago.create({
              data: {
                ...datos,
                claveCarga:
                  caso === 'clave-carga' ? f.qr.claveCarga : randomUUID(),
                assetId: caso === 'asset' ? f.qr.assetId : randomUUID(),
                publicId: caso === 'recurso' ? f.qr.publicId : randomUUID(),
              },
            }),
          ).rejects.toThrow();
        }
        if (caso === 'clave-instruccion') {
          const { id, ...datos } = f.instruccion;
          expect(id).toBeTruthy();
          await expect(
            tx.instruccionPago.create({ data: { ...datos, respuesta: {} } }),
          ).rejects.toThrow();
        }
      });
    });
    it.each([
      'qr-otro-metodo',
      'instruccion-otro-metodo',
      'pedido-otra-clave',
      'pago-otro-metodo',
      'pago-otro-pedido',
      'segunda-instruccion-pedido',
    ])('impide cruzar referencias: %s', async (caso) => {
      await aislado(async (tx, f) => {
        if (caso === 'qr-otro-metodo')
          await expect(
            tx.metodoPagoConfigurado.update({
              where: {
                versionId_metodo: { versionId: f.version.id, metodo: 'PLIN' },
              },
              data: { archivoQrId: f.qr.id },
            }),
          ).rejects.toThrow();
        if (caso === 'instruccion-otro-metodo')
          await expect(
            tx.instruccionPago.update({
              where: { id: f.instruccion.id },
              data: { metodo: 'PLIN' },
            }),
          ).rejects.toThrow();
        if (caso === 'pedido-otra-clave') {
          const p = await pedido(tx, f);
          await expect(
            tx.instruccionPago.update({
              where: { id: f.instruccion.id },
              data: { pedidoId: p.id },
            }),
          ).rejects.toThrow();
        }
        if (caso.startsWith('pago-') || caso === 'segunda-instruccion-pedido') {
          const p = await pedido(tx, f, f.instruccion.claveCreacionPedido);
          await tx.instruccionPago.update({
            where: { id: f.instruccion.id },
            data: { pedidoId: p.id },
          });
          if (caso === 'pago-otro-metodo')
            await expect(
              tx.pagoPedido.create({
                data: {
                  pedidoId: p.id,
                  metodo: 'PLIN',
                  instruccionId: f.instruccion.id,
                },
              }),
            ).rejects.toThrow();
          if (caso === 'pago-otro-pedido') {
            const q = await pedido(tx, f);
            await expect(
              tx.pagoPedido.create({
                data: {
                  pedidoId: q.id,
                  metodo: 'YAPE',
                  instruccionId: f.instruccion.id,
                },
              }),
            ).rejects.toThrow();
          }
          if (caso === 'segunda-instruccion-pedido') {
            const { id, claveSolicitud, ...datos } = f.instruccion;
            expect(id).toBeTruthy();
            expect(claveSolicitud).toBeTruthy();
            await expect(
              tx.instruccionPago.create({
                data: {
                  ...datos,
                  respuesta: {},
                  claveSolicitud: randomUUID(),
                  pedidoId: p.id,
                },
              }),
            ).rejects.toThrow();
          }
        }
      });
    });
    it('no permite desvincular o cambiar una instrucción ya referenciada por un pago', async () => {
      await aislado(async (tx, f) => {
        const p = await pedido(tx, f, f.instruccion.claveCreacionPedido);
        await tx.instruccionPago.update({
          where: { id: f.instruccion.id },
          data: { pedidoId: p.id },
        });
        await tx.pagoPedido.create({
          data: {
            pedidoId: p.id,
            metodo: 'YAPE',
            instruccionId: f.instruccion.id,
          },
        });
        await expect(
          tx.instruccionPago.update({
            where: { id: f.instruccion.id },
            data: { pedidoId: null },
          }),
        ).rejects.toThrow();
      });
    });
    it.each(['qr', 'version', 'metodo', 'responsable', 'propietario'])(
      'restringe eliminación de %s con referencias históricas',
      async (caso) => {
        await aislado(async (tx, f) => {
          const operaciones = {
            qr: () => tx.archivoQrPago.delete({ where: { id: f.qr.id } }),
            version: () =>
              tx.versionConfiguracionPagos.delete({
                where: { id: f.version.id },
              }),
            metodo: () =>
              tx.metodoPagoConfigurado.delete({ where: { id: f.metodo.id } }),
            responsable: () => tx.usuario.delete({ where: { id: f.admin.id } }),
            propietario: () =>
              tx.usuario.delete({ where: { id: f.cliente.id } }),
          };
          await expect(
            operaciones[caso as keyof typeof operaciones](),
          ).rejects.toThrow();
        });
      },
    );
    const versionesInvalidas = [
      ['numero', 0],
      ['clave_solicitud', 'incorrecta'],
      ['solicitud_hash', 'F'.repeat(64)],
      ['respuesta', '[]'],
    ] as const;
    for (const tabla of [
      'versiones_configuracion_pagos',
      'versiones_configuracion_tienda',
    ])
      it.each(versionesInvalidas)(
        'rechaza ' + tabla + ' inválida: %s',
        async (campo, valor) => {
          await aislado(async (tx, f) => {
            const id = tabla.endsWith('pagos') ? f.version.id : f.tienda.id;
            await expect(
              tx.$executeRaw(
                Prisma.sql`UPDATE ${Prisma.raw(tabla)} SET ${Prisma.raw(campo)} = ${valor} WHERE id = ${id}`,
              ),
            ).rejects.toThrow();
          });
        },
      );
    it.each([
      ['activo', 2],
      ['celular', '123456789'],
      ['celular', null],
      ['titular', null],
      ['titular', '   '],
      ['titular', 'Titular\nOculto'],
    ] as const)('rechaza método activo inválido: %s', async (campo, valor) => {
      await aislado(async (tx, f) => {
        await expect(
          tx.$executeRaw(
            Prisma.sql`UPDATE metodos_pago_configurados SET ${Prisma.raw(campo)} = ${valor} WHERE id = ${f.metodo.id}`,
          ),
        ).rejects.toThrow();
      });
    });
    it.each([
      ['bytes', 0],
      ['bytes', 2097153],
      ['ancho', 4097],
      ['alto', 0],
      ['estado', ''],
      ['solicitud_hash', 'abc'],
      ['hash_contenido', 'A'.repeat(64)],
      ['nombre_original', ''],
      ['public_id', ''],
      ['carpeta_cloudinary', 'SOHO/productos/otro'],
      ['metodo', 'PLIN'],
      ['resource_type', 'raw'],
      ['url_entrega', 'http://inseguro.test/qr.png'],
      ['asset_id', null],
      ['version_cloudinary', 0],
      ['confirmado_en', null],
      ['token_carga', randomUUID()],
      ['estado', 'CONCILIANDO'],
      ['estado', 'ELIMINANDO'],
      ['estado', 'ELIMINADO'],
    ] as const)(
      'rechaza metadatos QR inválidos: %s = %s',
      async (campo, valor) => {
        await aislado(async (tx, f) => {
          await expect(
            tx.$executeRaw(
              Prisma.sql`UPDATE archivos_qr_pago SET ${Prisma.raw(campo)} = ${valor} WHERE id = ${f.qr.id}`,
            ),
          ).rejects.toThrow();
        });
      },
    );
    it('distingue una carga pendiente conciliable de un recurso disponible', async () => {
      await aislado(async (tx, f) => {
        await tx.metodoPagoConfigurado.update({
          where: { id: f.metodo.id },
          data: { archivoQrId: null },
        });
        const pendiente = await tx.archivoQrPago.update({
          where: { id: f.qr.id },
          data: {
            estado: 'CONCILIANDO',
            assetId: null,
            urlEntrega: null,
            versionCloudinary: null,
            confirmadoEn: null,
            tokenCarga: randomUUID(),
            bloqueoCargaHasta: new Date(Date.now() + 60000),
          },
        });
        expect(pendiente.estado).toBe('CONCILIANDO');
        await expect(
          tx.archivoQrPago.update({
            where: { id: pendiente.id },
            data: { estado: 'DISPONIBLE' },
          }),
        ).rejects.toThrow();
      });
    });
    it.each([
      'sin-propietario',
      'dos-propietarios',
      'hash-invitado',
      'clave-checkout',
      'hash-preparacion',
      'importe',
      'respuesta',
    ])('rechaza instrucción inválida: %s', async (caso) => {
      await aislado(async (tx, f) => {
        const cambio: Prisma.InstruccionPagoUncheckedUpdateInput =
          caso === 'sin-propietario'
            ? { usuarioId: null }
            : caso === 'dos-propietarios'
              ? { accesoInvitadoHash: 'a'.repeat(64) }
              : caso === 'hash-invitado'
                ? { usuarioId: null, accesoInvitadoHash: 'incorrecto' }
                : caso === 'clave-checkout'
                  ? { claveCreacionPedido: 'incorrecta' }
                  : caso === 'hash-preparacion'
                    ? { preparacionHash: 'A'.repeat(64) }
                    : caso === 'importe'
                      ? { importeReferencia: '-0.01' }
                      : { respuesta: [] };
        await expect(
          tx.instruccionPago.update({
            where: { id: f.instruccion.id },
            data: cambio,
          }),
        ).rejects.toThrow();
      });
    });
    it('conserva instrucciones invitadas sin fabricar una cuenta ni una caducidad', async () => {
      await aislado(async (tx, f) => {
        const i = await tx.instruccionPago.update({
          where: { id: f.instruccion.id },
          data: { usuarioId: null, accesoInvitadoHash: 'a'.repeat(64) },
        });
        expect(i.usuarioId).toBeNull();
        expect(i.accesoInvitadoHash).toHaveLength(64);
        expect(i.pedidoId).toBeNull();
      });
    });
    it.each([
      ['correo', 'Correo@Ejemplo.test'],
      ['correo', 'mal-formado'],
      ['whatsapp', '123456789'],
      ['horario', '   '],
      ['cambios', 'x'.repeat(10001)],
      ['privacidad', 'solo\u0000control'],
      ['terminos', '  \n  '],
    ] as const)(
      'rechaza datos de Tienda inválidos: %s',
      async (campo, valor) => {
        await aislado(async (tx, f) => {
          await expect(
            tx.$executeRaw(
              Prisma.sql`UPDATE versiones_configuracion_tienda SET ${Prisma.raw(campo)} = ${valor} WHERE id = ${f.tienda.id}`,
            ),
          ).rejects.toThrow();
        });
      },
    );
    const enlacesInvalidos = [
      null,
      [],
      {},
      [enlaces[0]],
      [...enlaces, enlaces[0]],
      [{ texto: 'Ayuda', url: 'javascript:alert(1)' }, enlaces[0]],
      [
        { texto: 'Ayuda', url: 'https://usuario:clave@ejemplo.test' },
        enlaces[0],
      ],
      [{ texto: '', url: 'https://ejemplo.test' }, enlaces[0]],
      [{ texto: 'Ayuda' }, enlaces[0]],
      [{ texto: 'Ayuda', url: null, extra: 1 }, enlaces[0]],
      [{ texto: 'x'.repeat(101), url: null }, enlaces[0]],
      [
        { texto: 'Ayuda', url: 'https://ejemplo.test/' + 'x'.repeat(2048) },
        enlaces[0],
      ],
    ];
    it.each(enlacesInvalidos.map((v, i) => [i, JSON.stringify(v)] as const))(
      'rechaza estructura o URL de enlaces de Tienda %i',
      async (_i, valor) => {
        await aislado(async (tx, f) => {
          await expect(
            tx.$executeRaw(
              Prisma.sql`UPDATE versiones_configuracion_tienda SET enlaces = ${valor} WHERE id = ${f.tienda.id}`,
            ),
          ).rejects.toThrow();
        });
      },
    );
  },
);
