import { randomUUID } from 'node:crypto';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test')) {
  throw new Error(
    'El esquema de envíos requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
}
const prisma = crearClientePrisma(url);
const rollback = Symbol('rollback de estructura de envios');

async function fixture(tx: Prisma.TransactionClient) {
  const prefijo = 'env-' + randomUUID().slice(0, 8);
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
    datos: Awaited<ReturnType<typeof fixture>>,
  ) => Promise<void>,
) {
  await expect(
    prisma.$transaction(
      async (tx) => {
        const datos = await fixture(tx);
        await comprobar(tx, datos);
        throw rollback;
      },
      { timeout: 30000 },
    ),
  ).rejects.toBe(rollback);
}

describe.sequential('Esquema de envíos con Prisma y MySQL temporal', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crea preparación anidada y resuelve relaciones sin modificar stock ni estados', async () => {
    await aislado(async (tx, f) => {
      const envio = await tx.pedido.update({
        where: { id: f.pedido.id },
        data: {
          envio: {
            create: {
              preparacionIniciadaEn: f.inicio,
              preparacionIniciadaPorId: f.admin.id,
            },
          },
        },
        include: {
          envio: {
            include: { preparacionIniciadaPor: true, movimientos: true },
          },
        },
      });
      expect(envio.envio).toMatchObject({
        transportista: null,
        despachadoEn: null,
        entregadoEn: null,
        movimientos: [],
        preparacionIniciadaPor: { id: f.admin.id },
      });
      expect(envio.envio!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(envio.estadoEntrega).toBe('CONFIRMADO');
      expect(
        await tx.variante.findUnique({ where: { id: f.variante.id } }),
      ).toMatchObject({ existencias: 10, cantidadReservada: 2 });
      expect(
        (
          await tx.usuario.findUniqueOrThrow({
            where: { id: f.admin.id },
            include: { preparacionesEnvio: true },
          })
        ).preparacionesEnvio,
      ).toHaveLength(1);
    });
  });

  it('guarda despacho y entrega con sus tres responsables y conserva la referencia como texto', async () => {
    await aislado(async (tx, f) => {
      const envio = await tx.envioPedido.create({
        data: {
          pedidoId: f.pedido.id,
          preparacionIniciadaEn: f.inicio,
          preparacionIniciadaPorId: f.admin.id,
        },
      });
      const despachadoEn = new Date(f.inicio.getTime() + 3600000),
        entregadoEn = new Date(despachadoEn.getTime() + 3600000);
      await tx.envioPedido.update({
        where: { id: envio.id },
        data: {
          transportista: 'Reparto local',
          referenciaSeguimiento: '000123',
          despachadoEn,
          despachadoPorId: f.admin.id,
        },
      });
      const final = await tx.envioPedido.update({
        where: { id: envio.id },
        data: { entregadoEn, entregaRegistradaPorId: f.admin.id },
        include: {
          pedido: true,
          preparacionIniciadaPor: true,
          despachadoPor: true,
          entregaRegistradaPor: true,
        },
      });
      expect(final.referenciaSeguimiento).toBe('000123');
      expect(final.entregadoEn!.toISOString()).toBe(entregadoEn.toISOString());
      expect([
        final.preparacionIniciadaPor.id,
        final.despachadoPor!.id,
        final.entregaRegistradaPor!.id,
      ]).toEqual([f.admin.id, f.admin.id, f.admin.id]);
      expect(final.pedido.direccion).toBe('Av. Histórica 123');
      const admin = await tx.usuario.findUniqueOrThrow({
        where: { id: f.admin.id },
        include: { despachosEnvio: true, entregasEnvio: true },
      });
      expect(admin.despachosEnvio).toHaveLength(1);
      expect(admin.entregasEnvio).toHaveLength(1);
    });
  });

  it('vincula la salida a pedido y variante mediante creación anidada', async () => {
    await aislado(async (tx, f) => {
      const envio = await tx.envioPedido.create({
        data: {
          pedidoId: f.pedido.id,
          preparacionIniciadaEn: f.inicio,
          preparacionIniciadaPorId: f.admin.id,
          transportista: 'Responsable local',
          referenciaSeguimiento: 'LOCAL-001',
          despachadoEn: f.inicio,
          despachadoPorId: f.admin.id,
          movimientos: {
            create: {
              varianteId: f.variante.id,
              usuarioResponsableId: f.admin.id,
              tipo: 'SALIDA',
              origen: 'ENVIO_PEDIDO',
              cantidad: -2,
              saldoAnterior: 10,
              saldoPosterior: 8,
              cantidadReservada: 0,
              varianteHabilitada: true,
              motivo: 'Despacho de pedido',
              referencia: f.pedido.codigo,
            },
          },
        },
        include: {
          movimientos: {
            include: {
              envioPedido: { include: { pedido: true } },
              variante: true,
            },
          },
        },
      });
      expect(envio.movimientos).toHaveLength(1);
      expect(envio.movimientos[0]).toMatchObject({
        origen: 'ENVIO_PEDIDO',
        cantidad: -2,
        envioPedido: { pedido: { codigo: f.pedido.codigo } },
        variante: { id: f.variante.id },
      });
      expect(
        await tx.reservaInventario.findUnique({ where: { id: f.reserva.id } }),
      ).toMatchObject({ estado: 'ACTIVA' });
      expect(
        await tx.variante.findUnique({ where: { id: f.variante.id } }),
      ).toMatchObject({ existencias: 10, cantidadReservada: 2 });
    });
  });

  it('la unicidad impide un segundo envío y una segunda salida de la misma variante', async () => {
    await aislado(async (tx, f) => {
      const envio = await tx.envioPedido.create({
        data: { pedidoId: f.pedido.id, preparacionIniciadaPorId: f.admin.id },
      });
      await expect(
        tx.envioPedido.create({
          data: { pedidoId: f.pedido.id, preparacionIniciadaPorId: f.admin.id },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const data = {
        varianteId: f.variante.id,
        usuarioResponsableId: f.admin.id,
        envioPedidoId: envio.id,
        tipo: 'SALIDA' as const,
        origen: 'ENVIO_PEDIDO' as const,
        cantidad: -2,
        saldoAnterior: 10,
        saldoPosterior: 8,
        cantidadReservada: 0,
        varianteHabilitada: true,
        motivo: 'Movimiento de prueba',
      };
      await tx.movimientoInventario.create({ data });
      await expect(
        tx.movimientoInventario.create({ data }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(
        await tx.movimientoInventario.count({
          where: { envioPedidoId: envio.id },
        }),
      ).toBe(1);
    });
  });

  it('permite varios movimientos anteriores con envío nulo y ambos orígenes previos', async () => {
    await aislado(async (tx, f) => {
      const base = {
        varianteId: f.variante.id,
        tipo: 'ENTRADA' as const,
        cantidad: 10,
        saldoAnterior: 0,
        saldoPosterior: 10,
        cantidadReservada: 0,
        varianteHabilitada: true,
        motivo: 'Datos conservados',
      };
      await tx.movimientoInventario.createMany({
        data: [
          { ...base, origen: 'MANUAL' },
          { ...base, origen: 'MANUAL' },
          { ...base, origen: 'STOCK_INICIAL' },
        ],
      });
      const movimientos = await tx.movimientoInventario.findMany({
        where: { varianteId: f.variante.id },
      });
      expect(movimientos).toHaveLength(3);
      expect(
        movimientos.every(
          (m) => m.envioPedidoId === null && m.usuarioResponsableId === null,
        ),
      ).toBe(true);
    });
  });

  it('rechaza datos de despacho incompletos y entregas sin despacho desde Prisma', async () => {
    await aislado(async (tx, f) => {
      const envio = await tx.envioPedido.create({
        data: {
          pedidoId: f.pedido.id,
          preparacionIniciadaEn: f.inicio,
          preparacionIniciadaPorId: f.admin.id,
        },
      });
      await expect(
        tx.envioPedido.update({
          where: { id: envio.id },
          data: { transportista: 'Reparto local' },
        }),
      ).rejects.toThrow();
      await expect(
        tx.envioPedido.update({
          where: { id: envio.id },
          data: { entregadoEn: f.inicio, entregaRegistradaPorId: f.admin.id },
        }),
      ).rejects.toThrow();
      expect(
        await tx.envioPedido.findUnique({ where: { id: envio.id } }),
      ).toMatchObject({ transportista: null, entregadoEn: null });
    });
  });

  it('revierte también envío, movimiento, reserva y saldos al fallar una transacción', async () => {
    let pedidoId = '',
      varianteId = '';
    await aislado(async (tx, f) => {
      pedidoId = f.pedido.id;
      varianteId = f.variante.id;
      const envio = await tx.envioPedido.create({
        data: {
          pedidoId,
          preparacionIniciadaEn: f.inicio,
          preparacionIniciadaPorId: f.admin.id,
          transportista: 'Reparto local',
          referenciaSeguimiento: 'LOCAL-123',
          despachadoEn: f.inicio,
          despachadoPorId: f.admin.id,
        },
      });
      await tx.reservaInventario.update({
        where: { id: f.reserva.id },
        data: {
          estado: 'CONSUMIDA',
          cerradaEn: new Date(),
          motivoCierre: 'Despacho de prueba',
        },
      });
      await tx.variante.update({
        where: { id: varianteId },
        data: { existencias: 8, cantidadReservada: 0 },
      });
      await tx.movimientoInventario.create({
        data: {
          varianteId,
          envioPedidoId: envio.id,
          usuarioResponsableId: f.admin.id,
          tipo: 'SALIDA',
          origen: 'ENVIO_PEDIDO',
          cantidad: -2,
          saldoAnterior: 10,
          saldoPosterior: 8,
          cantidadReservada: 0,
          varianteHabilitada: true,
          motivo: 'Despacho de prueba',
        },
      });
      expect(
        (await tx.variante.findUniqueOrThrow({ where: { id: varianteId } }))
          .existencias,
      ).toBe(8);
    });
    expect(
      await prisma.pedido.findUnique({ where: { id: pedidoId } }),
    ).toBeNull();
    expect(
      await prisma.envioPedido.findUnique({ where: { pedidoId } }),
    ).toBeNull();
    expect(
      await prisma.movimientoInventario.count({ where: { varianteId } }),
    ).toBe(0);
    expect(
      await prisma.reservaInventario.count({
        where: { articulo: { pedidoId } },
      }),
    ).toBe(0);
  });
});
