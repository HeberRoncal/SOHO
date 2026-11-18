import { randomUUID } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'El esquema de inventario requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url);
const rollback = Symbol('rollback de estructura de inventario');

async function fixture(tx: Prisma.TransactionClient) {
  const prefijo = 'mov-esquema-' + randomUUID();
  const admin = await tx.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Inventario',
      correo: prefijo + '@inventario.test',
      rol: 'ADMIN',
    },
  });
  const producto = await tx.producto.create({
    data: {
      slug: prefijo,
      codigoInterno: prefijo.slice(0, 32),
      nombre: 'Producto de inventario',
    },
  });
  const color = await tx.productoColor.create({
    data: {
      productoId: producto.id,
      codigo: 'BL',
      nombre: 'Blanco',
      hexadecimal: '#FFFFFF',
    },
  });
  const talla = await tx.talla.upsert({
    where: { sistema_valor: { sistema: 'EU', valor: '40.5' } },
    create: { valor: '40.5' },
    update: {},
  });
  const variante = await tx.variante.create({
    data: {
      productoId: producto.id,
      productoColorId: color.id,
      tallaId: talla.id,
      sku: prefijo + '-40P5',
      existencias: 5,
      cantidadReservada: 2,
    },
  });
  const movimiento: Prisma.MovimientoInventarioUncheckedCreateInput = {
    id: randomUUID(),
    varianteId: variante.id,
    usuarioResponsableId: admin.id,
    tipo: 'ENTRADA',
    origen: 'MANUAL',
    cantidad: 2,
    saldoAnterior: 5,
    saldoPosterior: 7,
    cantidadReservada: 2,
    varianteHabilitada: true,
    motivo: 'Reposición comprobada',
    claveSolicitud: randomUUID(),
    solicitudHash: 'a'.repeat(64),
    respuesta: {
      movimiento: { saldoAnterior: 5, saldo: 7 },
      operacion: { versionAnterior: 1, versionPosterior: 2 },
    },
  };
  return { admin, producto, variante, movimiento };
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

describe.sequential(
  'Preparación del inventario con Prisma y MySQL temporal',
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it('asigna versión física inicial sin cambiar existencias o reservas', async () => {
      await aislado(async (tx, f) => {
        expect(f.variante).toMatchObject({
          versionExistencias: 1,
          existencias: 5,
          cantidadReservada: 2,
        });
        const p = await tx.producto.findUniqueOrThrow({
          where: { id: f.producto.id },
        });
        expect(p.version).toBe(1);
      });
    });
    it('conserva movimientos anteriores con responsable y clave nulos', async () => {
      await aislado(async (tx, f) => {
        const { claveSolicitud, solicitudHash, respuesta, ...datos } =
          f.movimiento;
        expect(claveSolicitud).toBeTruthy();
        expect(solicitudHash).toBeTruthy();
        expect(respuesta).toBeTruthy();
        for (let i = 0; i < 2; i++)
          await tx.movimientoInventario.create({
            data: { ...datos, id: randomUUID(), usuarioResponsableId: null },
          });
        expect(
          await tx.movimientoInventario.count({
            where: { varianteId: f.variante.id, claveSolicitud: null },
          }),
        ).toBe(2);
      });
    });
    it('recupera el JSON original por clave aunque después cambie el stock', async () => {
      await aislado(async (tx, f) => {
        const original = await tx.movimientoInventario.create({
          data: f.movimiento,
        });
        await tx.variante.update({
          where: { id: f.variante.id },
          data: { existencias: 9, versionExistencias: { increment: 1 } },
        });
        const recuperado = await tx.movimientoInventario.findUniqueOrThrow({
          where: { claveSolicitud: original.claveSolicitud! },
          include: { usuarioResponsable: true, variante: true },
        });
        expect(recuperado.respuesta).toEqual(original.respuesta);
        expect(recuperado.usuarioResponsable?.id).toBe(f.admin.id);
        expect(recuperado.variante.existencias).toBe(9);
      });
    });
    it('impide insertar dos movimientos con la misma clave', async () => {
      await aislado(async (tx, f) => {
        await tx.movimientoInventario.create({ data: f.movimiento });
        await expect(
          tx.movimientoInventario.create({
            data: { ...f.movimiento, id: randomUUID() },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
        expect(
          await tx.movimientoInventario.count({
            where: { varianteId: f.variante.id },
          }),
        ).toBe(1);
      });
    });
    it.each(['claveSolicitud', 'solicitudHash', 'respuesta'] as const)(
      'rechaza la recuperación incompleta sin %s',
      async (campo) => {
        await aislado(async (tx, f) => {
          const data = { ...f.movimiento };
          delete data[campo];
          await expect(
            tx.movimientoInventario.create({ data }),
          ).rejects.toThrow();
        });
      },
    );
    it.each([Prisma.JsonNull, [], 'texto', 1, true])(
      'rechaza respuestas JSON que no son objetos (%j)',
      async (respuesta) => {
        await aislado(async (tx, f) => {
          await expect(
            tx.movimientoInventario.create({
              data: { ...f.movimiento, respuesta },
            }),
          ).rejects.toThrow();
        });
      },
    );
    it('exige responsable en una nueva operación recuperable', async () => {
      await aislado(async (tx, f) => {
        await expect(
          tx.movimientoInventario.create({
            data: { ...f.movimiento, usuarioResponsableId: null },
          }),
        ).rejects.toThrow();
      });
    });
    it('impide usar recuperación manual para un stock inicial automático', async () => {
      await aislado(async (tx, f) => {
        await expect(
          tx.movimientoInventario.create({
            data: {
              ...f.movimiento,
              origen: 'STOCK_INICIAL',
              saldoAnterior: 0,
              saldoPosterior: 2,
            },
          }),
        ).rejects.toThrow();
      });
    });
    it('permite actualizar por versión física y rechaza una expectativa obsoleta', async () => {
      await aislado(async (tx, f) => {
        const where = { id: f.variante.id, versionExistencias: 1 };
        expect(
          (
            await tx.variante.updateMany({
              where,
              data: {
                existencias: { increment: 2 },
                versionExistencias: { increment: 1 },
              },
            })
          ).count,
        ).toBe(1);
        expect(
          (
            await tx.variante.updateMany({
              where,
              data: {
                existencias: { increment: 2 },
                versionExistencias: { increment: 1 },
              },
            })
          ).count,
        ).toBe(0);
        expect(
          await tx.variante.findUniqueOrThrow({ where: { id: f.variante.id } }),
        ).toMatchObject({
          existencias: 7,
          versionExistencias: 2,
          cantidadReservada: 2,
        });
      });
    });
    it('mantiene independiente el contador físico de reservas y versión comercial', async () => {
      await aislado(async (tx, f) => {
        const v = await tx.variante.update({
          where: { id: f.variante.id },
          data: { cantidadReservada: 3 },
        });
        expect(v.versionExistencias).toBe(1);
        expect(
          (
            await tx.producto.findUniqueOrThrow({
              where: { id: f.producto.id },
            })
          ).version,
        ).toBe(1);
      });
    });
    it('rechaza una versión cero desde el cliente generado', async () => {
      await aislado(async (tx, f) => {
        await expect(
          tx.variante.update({
            where: { id: f.variante.id },
            data: { versionExistencias: 0 },
          }),
        ).rejects.toThrow();
      });
    });
    it('revierte el físico y su versión si falla el registro histórico', async () => {
      let id = '';
      await expect(
        prisma.$transaction(async (tx) => {
          const f = await fixture(tx);
          id = f.variante.id;
          await tx.variante.update({
            where: { id },
            data: {
              existencias: { increment: 2 },
              versionExistencias: { increment: 1 },
            },
          });
          await tx.movimientoInventario.create({
            data: { ...f.movimiento, respuesta: Prisma.JsonNull },
          });
        }),
      ).rejects.toThrow();
      expect(await prisma.variante.findUnique({ where: { id } })).toBeNull();
    });
  },
);
