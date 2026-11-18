import { randomUUID } from 'node:crypto';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import {
  INCLUIR_PEDIDO,
  respuestaPedido,
} from '../src/pedidos/dto/respuesta-pedido.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Cancelaciones requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url),
  rollback = Symbol('rollback del esquema de cancelaciones');
async function fixture(tx: Prisma.TransactionClient) {
  const prefijo = 'can-' + randomUUID().slice(0, 8);
  const inicio = new Date('2026-11-14T09:00:00.000Z');
  const admin = await tx.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Envios',
      correo: prefijo + '@envios.test',
      rol: 'ADMIN',
      claveHash:
        '$argon2id$v=19$m=19456,t=2,p=1$' +
        'A'.repeat(22) +
        '$' +
        'B'.repeat(43),
    },
  });
  const marca = await tx.marca.create({
    data: { codigo: prefijo, nombre: prefijo, slug: prefijo },
  });
  const categoria = await tx.categoria.create({
    data: { nombre: prefijo, slug: prefijo },
  });
  const talla = await tx.talla.upsert({
    where: { sistema_valor: { sistema: 'EU', valor: 40.5 } },
    create: { valor: 40.5 },
    update: {},
  });
  const producto = await tx.producto.create({
    data: {
      codigoInterno: prefijo,
      slug: prefijo,
      nombre: 'Producto histórico de envíos',
      modelo: 'Modelo',
      precio: '99.99',
      marcaId: marca.id,
      categoriaId: categoria.id,
      colores: {
        create: {
          codigo: 'BL',
          nombre: 'Blanco',
          hexadecimal: '#FFFFFF',
          variantes: {
            create: {
              tallaId: talla.id,
              sku: prefijo + '-BL-40P5',
              existencias: 10,
              cantidadReservada: 2,
            },
          },
        },
      },
    },
    include: { colores: { include: { variantes: true } } },
  });
  const variante = producto.colores[0].variantes[0];
  const politica = await tx.configuracionReserva.findUniqueOrThrow({
    where: { id: 1 },
  });
  const pedido = await tx.pedido.create({
    data: {
      codigo:
        'SOHO-' + randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(),
      usuarioId: admin.id,
      claveCreacion: randomUUID(),
      solicitudHash: 'a'.repeat(64),
      nombres: 'Ana',
      apellidos: 'Envios',
      correo: admin.correo,
      destinatario: 'Otra Persona',
      celular: '987654321',
      distritoCodigo: 'la-esperanza',
      distritoNombre: 'La Esperanza',
      direccion: 'Av. Histórica 123',
      subtotal: '199.98',
      total: '199.98',
      costoEnvio: '0.00',
      estadoEntrega: 'CONFIRMADO',
      version: 2,
      articulos: {
        create: {
          varianteId: variante.id,
          sku: variante.sku,
          nombreProducto: producto.nombre,
          color: 'Blanco',
          talla: '40.5',
          imagen: '/imagenes/envios.webp',
          cantidad: 2,
          precioUnitario: '99.99',
          importeBruto: '199.98',
          importeNeto: '199.98',
          unidades: {
            create: [1, 2].map((numero) => ({
              numero,
              importeBruto: '99.99',
              importeNeto: '99.99',
            })),
          },
          reservas: {
            create: {
              cantidad: 2,
              configuracionVersion: politica.version,
              modo: politica.modo,
              horas: politica.horas,
              accionVencimiento: politica.accionVencimiento,
              accionCancelacion: politica.accionCancelacion,
              creadoEn: inicio,
              venceEn:
                politica.modo === 'TIEMPO'
                  ? new Date(inicio.getTime() + politica.horas! * 3600000)
                  : null,
            },
          },
        },
      },
      pago: {
        create: {
          metodo: 'YAPE',
          estado: 'APROBADO',
          version: 2,
          comprobantes: {
            create: {
              version: 1,
              archivoClave: 'comprobantes/' + randomUUID() + '.png',
              archivoSha256: 'b'.repeat(64),
              nombreArchivo: 'captura.png',
              formato: 'image/png',
              tamanoBytes: 123,
              numeroOperacion: '001234',
              estadoRevision: 'APROBADO',
              revisadoPorId: admin.id,
              creadoEn: inicio,
              revisadoEn: inicio,
            },
          },
        },
      },
    },
    include: { articulos: { include: { reservas: true } } },
  });
  return {
    admin,
    producto,
    variante,
    pedido,
    inicio,
    articulo: pedido.articulos[0],
    reserva: pedido.articulos[0].reservas[0],
  };
}

async function aislado(
  comprobar: (
    tx: Prisma.TransactionClient,
    f: Awaited<ReturnType<typeof fixture>>,
  ) => Promise<void>,
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
const datos = (f: Awaited<ReturnType<typeof fixture>>) => ({
  pedidoId: f.pedido.id,
  motivo: 'El cliente solicitó cancelar su pedido.',
  registradaPorId: f.admin.id,
  estadoEntregaAnterior: 'CONFIRMADO' as const,
  estadoPagoAnterior: 'APROBADO' as const,
  versionPedido: 3,
  canceladaEn: new Date('2026-11-14T12:00:00.123Z'),
});
describe.sequential(
  'Esquema de cancelaciones con Prisma y MySQL temporal',
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it('crea la cancelación anidada, resuelve sus relaciones y no ejecuta cambios comerciales', async () => {
      await aislado(async (tx, f) => {
        const { pedidoId: _pedidoId, ...registro } = datos(f);
        const p = await tx.pedido.update({
          where: { id: f.pedido.id },
          data: { cancelacion: { create: registro } },
          include: {
            cancelacion: { include: { registradaPor: true } },
            pago: { include: { comprobantes: true } },
            articulos: { include: { reservas: true } },
          },
        });
        expect(p.cancelacion).toMatchObject({
          versionPedido: 3,
          estadoPagoAnterior: 'APROBADO',
          decisionReservasConsultadas: null,
          registradaPor: { id: f.admin.id },
        });
        expect(p.cancelacion!.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(p.cancelacion!.canceladaEn.toISOString()).toBe(
          '2026-11-14T12:00:00.123Z',
        );
        expect(p.estadoEntrega).toBe('CONFIRMADO');
        expect(p.version).toBe(2);
        expect(p.pago).toMatchObject({ estado: 'APROBADO', version: 2 });
        expect(p.pago!.comprobantes[0].estadoRevision).toBe('APROBADO');
        expect(p.articulos[0].reservas[0].estado).toBe('ACTIVA');
        expect(
          await tx.variante.findUnique({ where: { id: f.variante.id } }),
        ).toMatchObject({ existencias: 10, cantidadReservada: 2 });
        expect(
          await tx.movimientoInventario.count({
            where: { varianteId: f.variante.id },
          }),
        ).toBe(0);
        expect(
          (
            await tx.usuario.findUniqueOrThrow({
              where: { id: f.admin.id },
              include: { cancelacionesPedido: true },
            })
          ).cancelacionesPedido,
        ).toHaveLength(1);
      });
    });
    it.each(['LIBERAR', 'CONSERVAR'] as const)(
      'conserva la decisión %s y la política histórica sin cerrar reservas automáticamente',
      async (decision) => {
        await aislado(async (tx, f) => {
          await tx.reservaInventario.update({
            where: { id: f.reserva.id },
            data: { accionCancelacion: 'PREGUNTAR' },
          });
          await tx.cancelacionPedido.create({
            data: { ...datos(f), decisionReservasConsultadas: decision },
          });
          await tx.configuracionReserva.update({
            where: { id: 1 },
            data: { accionCancelacion: 'LIBERAR', version: { increment: 1 } },
          });
          expect(
            await tx.cancelacionPedido.findUnique({
              where: { pedidoId: f.pedido.id },
            }),
          ).toMatchObject({ decisionReservasConsultadas: decision });
          expect(
            await tx.reservaInventario.findUnique({
              where: { id: f.reserva.id },
            }),
          ).toMatchObject({
            estado: 'ACTIVA',
            accionCancelacion: 'PREGUNTAR',
            cerradaEn: null,
          });
        });
      },
    );
    it('conserva estados y versión históricos después de cambios posteriores del pedido', async () => {
      await aislado(async (tx, f) => {
        await tx.cancelacionPedido.create({ data: datos(f) });
        await tx.pedido.update({
          where: { id: f.pedido.id },
          data: { estadoEntrega: 'CANCELADO', version: 4 },
        });
        await tx.pagoPedido.update({
          where: { pedidoId: f.pedido.id },
          data: { estado: 'ANULADO', version: { increment: 1 } },
        });
        expect(
          await tx.cancelacionPedido.findUnique({
            where: { pedidoId: f.pedido.id },
          }),
        ).toMatchObject({
          estadoEntregaAnterior: 'CONFIRMADO',
          estadoPagoAnterior: 'APROBADO',
          versionPedido: 3,
        });
        expect(
          await tx.comprobantePago.findFirst({
            where: { pago: { pedidoId: f.pedido.id } },
          }),
        ).toMatchObject({
          estadoRevision: 'APROBADO',
          revisadoPorId: f.admin.id,
        });
      });
    });
    it('impide duplicar la cancelación y borrar su pedido o responsable', async () => {
      await aislado(async (tx, f) => {
        await tx.cancelacionPedido.create({ data: datos(f) });
        await expect(
          tx.cancelacionPedido.create({ data: datos(f) }),
        ).rejects.toMatchObject({ code: 'P2002' });
        await expect(
          tx.usuario.delete({ where: { id: f.admin.id } }),
        ).rejects.toMatchObject({ code: 'P2003' });
        await expect(
          tx.pedido.delete({ where: { id: f.pedido.id } }),
        ).rejects.toMatchObject({ code: 'P2003' });
        expect(
          await tx.cancelacionPedido.count({
            where: { pedidoId: f.pedido.id },
          }),
        ).toBe(1);
      });
    });
    it('conserva una preparación registrada y sus responsables al asociar la cancelación', async () => {
      await aislado(async (tx, f) => {
        const envio = await tx.envioPedido.create({
          data: {
            pedidoId: f.pedido.id,
            preparacionIniciadaPorId: f.admin.id,
            preparacionIniciadaEn: f.inicio,
          },
        });
        await tx.cancelacionPedido.create({
          data: { ...datos(f), estadoEntregaAnterior: 'EN_PREPARACION' },
        });
        const p = await tx.pedido.findUniqueOrThrow({
          where: { id: f.pedido.id },
          include: { envio: true, cancelacion: true },
        });
        expect(p.envio).toEqual(envio);
        expect(p.cancelacion!.estadoEntregaAnterior).toBe('EN_PREPARACION');
        expect(p.envio!.despachadoEn).toBeNull();
      });
    });
    it('el DTO público no expone el motivo ni el empleado de la nueva relación', async () => {
      await aislado(async (tx, f) => {
        await tx.cancelacionPedido.create({
          data: { ...datos(f), motivo: 'Motivo interno exclusivo de SOHO.' },
        });
        await tx.pedido.update({
          where: { id: f.pedido.id },
          data: { estadoEntrega: 'CANCELADO', version: 3 },
        });
        const p = await tx.pedido.findUniqueOrThrow({
          where: { id: f.pedido.id },
          include: {
            ...INCLUIR_PEDIDO,
            cancelacion: { include: { registradaPor: true } },
          },
        });
        const publico = respuestaPedido(p);
        expect(publico.estadoEntrega).toBe('CANCELADO');
        expect(publico.cancelacion).toEqual({
          fecha: p.cancelacion!.canceladaEn.toISOString(),
        });
        expect(JSON.stringify(publico)).not.toContain(
          'Motivo interno exclusivo',
        );
        expect(JSON.stringify(publico)).not.toContain(f.admin.id);
      });
    });
    it('el control de versión puede impedir una segunda operación sin crear otro registro', async () => {
      await aislado(async (tx, f) => {
        const version = f.pedido.version;
        expect(
          (
            await tx.pedido.updateMany({
              where: { id: f.pedido.id, version },
              data: { version: { increment: 1 }, estadoEntrega: 'CANCELADO' },
            })
          ).count,
        ).toBe(1);
        await tx.cancelacionPedido.create({
          data: { ...datos(f), versionPedido: version + 1 },
        });
        expect(
          (
            await tx.pedido.updateMany({
              where: { id: f.pedido.id, version },
              data: { version: { increment: 1 } },
            })
          ).count,
        ).toBe(0);
        expect(
          await tx.cancelacionPedido.count({
            where: { pedidoId: f.pedido.id },
          }),
        ).toBe(1);
      });
    });
    it('revierte todo el conjunto cuando falla después de crear la cancelación', async () => {
      const fallo = Symbol('fallo posterior a cancelación');
      let id = '';
      await expect(
        prisma.$transaction(
          async (tx) => {
            const f = await fixture(tx);
            id = f.pedido.id;
            await tx.cancelacionPedido.create({ data: datos(f) });
            await tx.pedido.update({
              where: { id },
              data: { estadoEntrega: 'CANCELADO', version: 3 },
            });
            throw fallo;
          },
          { timeout: 30000 },
        ),
      ).rejects.toBe(fallo);
      expect(
        await prisma.cancelacionPedido.findUnique({ where: { pedidoId: id } }),
      ).toBeNull();
      expect(await prisma.pedido.findUnique({ where: { id } })).toBeNull();
    });
  },
);
