import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';

const valor = process.env.TEST_DATABASE_URL;
if (!valor)
  throw Error('Recepciones requiere TEST_DATABASE_URL local con sufijo _test.');
const url = new URL(obtenerUrlBaseDatos(valor));
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !url.pathname.endsWith('_test')
)
  throw Error('Recepciones solo usa MySQL temporal local.');
const prisma = crearClientePrisma(valor),
  rollback = Symbol('rollback recepciones');
async function fixture(tx: Prisma.TransactionClient, lista = true) {
  const admin = await tx.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Recepciones',
      correo: randomUUID() + '@recepciones.test',
      rol: 'ADMIN',
    },
  });
  const cliente = await tx.usuario.create({
    data: {
      nombres: 'Cliente',
      apellidos: 'Recepciones',
      correo: randomUUID() + '@recepciones.test',
    },
  });
  const v = await tx.versionConfiguracionPagos.create({
    data: {
      numero: 1,
      claveSolicitud: randomUUID(),
      solicitudHash: 'a'.repeat(64),
      respuesta: {},
      responsableId: admin.id,
      metodos: {
        create: [
          {
            metodo: 'YAPE',
            activo: true,
            celular: '987654321',
            titular: 'SOHO',
          },
          { metodo: 'PLIN', activo: false },
        ],
      },
    },
    include: { metodos: true },
  });
  const i = await tx.instruccionPago.create({
    data: {
      metodoConfiguradoId: v.metodos.find((m) => m.metodo === 'YAPE')!.id,
      metodo: 'YAPE',
      claveSolicitud: randomUUID(),
      solicitudHash: 'a'.repeat(64),
      preparacionHash: 'b'.repeat(64),
      claveCreacionPedido: randomUUID(),
      usuarioId: cliente.id,
      importeReferencia: '106.00',
      respuesta: {
        versionContrato: 1,
        preparacion: { cotizacion: { total: '106.00' } },
      },
    },
  });
  let r = await tx.recepcionCompra.create({
    data: {
      referencia: 'REC-' + randomBytes(8).toString('hex').toUpperCase(),
      instruccionId: i.id,
      claveCreacionPedido: i.claveCreacionPedido,
      claveSolicitud: randomUUID(),
      solicitudHash: 'c'.repeat(64),
      motivos: [],
    },
  });
  let c = await tx.comprobanteRecepcionCompra.create({
    data: {
      recepcionId: r.id,
      version: 1,
      claveSolicitud: randomUUID(),
      solicitudHash: 'd'.repeat(64),
      archivoClave: 'comprobantes/' + randomUUID() + '.png',
      archivoSha256Original: 'e'.repeat(64),
      archivoSha256: 'f'.repeat(64),
      nombreArchivo: 'recibo.png',
      formato: 'image/png',
      tamanoBytes: 100,
      numeroOperacion: '0000123',
    },
  });
  if (lista) {
    const ahora = new Date();
    c = await tx.comprobanteRecepcionCompra.update({
      where: { id: c.id },
      data: { estadoArchivo: 'DISPONIBLE', confirmadoEn: ahora },
    });
    r = await tx.recepcionCompra.update({
      where: { id: r.id },
      data: {
        estado: 'RECIBIDA',
        comprobanteActualId: c.id,
        recibidaEn: ahora,
        respuesta: { recepcionId: r.id },
      },
    });
  }
  const op = await tx.operacionRecepcionCompra.create({
    data: {
      recepcionId: r.id,
      comprobanteId: c.id,
      claveSolicitud: randomUUID(),
      solicitudHash: '1'.repeat(64),
      accion: 'PROCESAR',
      actor: 'CLIENTE',
      responsableId: cliente.id,
      versionEsperada: 1,
      antes: { estado: r.estado },
    },
  });
  return { admin, cliente, i, r, c, op };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function aislado(
  fn: (tx: Prisma.TransactionClient, f: F) => Promise<void>,
  lista = true,
) {
  await expect(
    prisma.$transaction(
      async (tx) => {
        await fn(tx, await fixture(tx, lista));
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
      codigo: 'SOHO-' + randomBytes(8).toString('hex').toUpperCase(),
      claveCreacion: clave,
      solicitudHash: '2'.repeat(64),
      usuarioId: f.cliente.id,
      nombres: 'Cliente',
      apellidos: 'Anterior',
      correo: 'compra@recepciones.test',
      destinatario: 'Cliente Anterior',
      celular: '987654321',
      distritoCodigo: 'moche',
      distritoNombre: 'Moche',
      direccion: 'Av. Prueba 123',
      subtotal: '100.00',
      costoEnvio: '6.00',
      total: '106.00',
    },
  });
}
async function vincular(tx: Prisma.TransactionClient, f: F) {
  const p = await pedido(tx, f, f.i.claveCreacionPedido);
  await tx.instruccionPago.update({
    where: { id: f.i.id },
    data: { pedidoId: p.id },
  });
  const pago = await tx.pagoPedido.create({
    data: { pedidoId: p.id, metodo: 'YAPE', instruccionId: f.i.id },
  });
  await tx.recepcionCompra.update({
    where: { id: f.r.id },
    data: {
      estado: 'PEDIDO_CREADO',
      pedidoId: p.id,
      pagoId: pago.id,
      pedidoRegistradoEn: new Date(),
    },
  });
  await tx.comprobanteRecepcionCompra.update({
    where: { id: f.c.id },
    data: { pagoDestinoId: pago.id },
  });
  return { p, pago };
}
function datosCopia(f: F) {
  return {
    archivoPedidoClave: 'comprobantes/' + randomUUID() + '.png',
    archivoPedidoSha256: f.c.archivoSha256,
    archivoPedidoFormato: f.c.formato,
    archivoPedidoBytes: f.c.tamanoBytes,
    archivoPedidoEstado: 'PENDIENTE' as const,
  };
}
function datosComprobante(f: F, pagoId: string) {
  return {
    pagoId,
    version: 1,
    comprobanteRecepcionId: f.c.id,
    archivoClave: 'comprobantes/' + randomUUID() + '.png',
    archivoSha256: f.c.archivoSha256,
    nombreArchivo: 'copia.png',
    formato: f.c.formato,
    tamanoBytes: f.c.tamanoBytes,
  };
}

describe.sequential(
  'Estructura de recepción y procedencia con MySQL aislado',
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it('no inventa recepciones, archivos ni operaciones al migrar', async () => {
      expect(await prisma.recepcionCompra.count()).toBe(0);
      expect(await prisma.comprobanteRecepcionCompra.count()).toBe(0);
      expect(await prisma.operacionRecepcionCompra.count()).toBe(0);
    });
    it('reserva identidad de archivo y operación antes de confirmar IO, sin pedido ni pago', async () => {
      await aislado(async (tx, f) => {
        expect(f.r).toMatchObject({
          estado: 'RECIBIENDO',
          comprobanteActualId: null,
          pedidoId: null,
          pagoId: null,
          respuesta: null,
        });
        expect(f.c).toMatchObject({
          estadoArchivo: 'PENDIENTE',
          confirmadoEn: null,
        });
        expect(f.op).toMatchObject({ estado: 'PENDIENTE', respuesta: null });
        expect(await tx.pedido.count()).toBe(0);
        expect(await tx.pagoPedido.count()).toBe(0);
      }, false);
    });
    it('confirma archivo y recepción en pasos coherentes y permite atención sin reservar', async () => {
      await aislado(async (tx, f) => {
        await tx.comprobanteRecepcionCompra.update({
          where: { id: f.c.id },
          data: { estadoArchivo: 'DISPONIBLE', confirmadoEn: new Date() },
        });
        const r = await tx.recepcionCompra.update({
          where: { id: f.r.id },
          data: {
            estado: 'REQUIERE_ATENCION',
            comprobanteActualId: f.c.id,
            recibidaEn: new Date(),
            respuesta: { recibida: true },
            motivos: ['STOCK_INSUFICIENTE'],
          },
        });
        expect(r.pedidoId).toBeNull();
        expect(await tx.reservaInventario.count()).toBe(0);
      }, false);
    });
    it('conserva versiones anteriores al cambiar el comprobante actual', async () => {
      await aislado(async (tx, f) => {
        const ahora = new Date();
        const c = await tx.comprobanteRecepcionCompra.create({
          data: {
            recepcionId: f.r.id,
            version: 2,
            claveSolicitud: randomUUID(),
            solicitudHash: 'a'.repeat(64),
            archivoClave: 'comprobantes/' + randomUUID() + '.webp',
            archivoSha256Original: 'b'.repeat(64),
            archivoSha256: 'c'.repeat(64),
            nombreArchivo: 'nuevo.webp',
            formato: 'image/webp',
            tamanoBytes: 200,
            estadoArchivo: 'DISPONIBLE',
            creadoEn: ahora,
            confirmadoEn: ahora,
          },
        });
        await tx.recepcionCompra.update({
          where: { id: f.r.id },
          data: { comprobanteActualId: c.id },
        });
        expect(
          await tx.comprobanteRecepcionCompra.count({
            where: { recepcionId: f.r.id },
          }),
        ).toBe(2);
        expect(
          await tx.comprobanteRecepcionCompra.findUnique({
            where: { id: f.c.id },
          }),
        ).toEqual(f.c);
      });
    });
    it('vincula recepción, instrucción, pedido, pago y copia del comprobante sin compartir clave de archivo', async () => {
      await aislado(async (tx, f) => {
        const { p, pago } = await vincular(tx, f),
          c = await tx.comprobantePago.create({
            data: datosComprobante(f, pago.id),
          });
        expect(c.archivoClave).not.toBe(f.c.archivoClave);
        expect(c.archivoSha256).toBe(f.c.archivoSha256);
        expect(
          (
            await tx.recepcionCompra.findUniqueOrThrow({
              where: { id: f.r.id },
            })
          ).pedidoId,
        ).toBe(p.id);
      });
    });
    it('admite comprobantes anteriores sin procedencia de recepción', async () => {
      await aislado(async (tx, f) => {
        const p = await pedido(tx, f),
          pg = await tx.pagoPedido.create({
            data: { pedidoId: p.id, metodo: 'PLIN', estado: 'APROBADO' },
          });
        const c = await tx.comprobantePago.create({
          data: {
            pagoId: pg.id,
            version: 1,
            archivoClave: 'comprobantes/' + randomUUID() + '.png',
            archivoSha256: 'a'.repeat(64),
            nombreArchivo: 'anterior.png',
            formato: 'image/png',
            tamanoBytes: 100,
          },
        });
        expect(c.comprobanteRecepcionId).toBeNull();
      });
    });
    it('hereda propietario invitado desde la instrucción y conserva vencimiento independiente', async () => {
      await aislado(async (tx, f) => {
        await tx.instruccionPago.update({
          where: { id: f.i.id },
          data: { usuarioId: null, accesoInvitadoHash: '4'.repeat(64) },
        });
        const r = await tx.recepcionCompra.update({
          where: { id: f.r.id },
          data: {
            accesoInvitadoExpiraEn: new Date(Date.now() + 30 * 86400000),
          },
          include: { instruccion: true },
        });
        expect(r.instruccion.usuarioId).toBeNull();
        expect(r.instruccion.accesoInvitadoHash).toBe('4'.repeat(64));
      });
    });
    it('registra intención de copia y resultado confirmado con hash/bytes originales', async () => {
      await aislado(async (tx, f) => {
        await tx.operacionRecepcionCompra.update({
          where: { id: f.op.id },
          data: datosCopia(f),
        });
        const op = await tx.operacionRecepcionCompra.update({
          where: { id: f.op.id },
          data: {
            estado: 'CONFIRMADA',
            versionResultante: 2,
            despues: { estado: 'PEDIDO_CREADO' },
            respuesta: { pedido: 'recuperable' },
            codigoHttp: 200,
            finalizadoEn: new Date(),
            archivoPedidoEstado: 'DISPONIBLE',
            archivoPedidoConfirmadoEn: new Date(),
          },
        });
        expect(op.respuesta).toEqual({ pedido: 'recuperable' });
      });
    });
    it('registra rechazo final recuperable sin declarar un error de infraestructura como decisión final', async () => {
      await aislado(async (tx, f) => {
        await tx.operacionRecepcionCompra.update({
          where: { id: f.op.id },
          data: {
            estado: 'RECHAZADA',
            versionResultante: 1,
            despues: { sinCambios: true },
            respuesta: { codigo: 'VERSION_CAMBIADA' },
            codigoHttp: 409,
            finalizadoEn: new Date(),
          },
        });
        await expect(
          tx.operacionRecepcionCompra.update({
            where: { id: f.op.id },
            data: { codigoHttp: 503 },
          }),
        ).rejects.toThrow();
      });
    });

    it.each([
      'referencia',
      'instruccion',
      'checkout',
      'clave-recepcion',
      'clave-comprobante',
      'version-comprobante',
      'archivo-comprobante',
      'clave-operacion',
      'archivo-copia',
    ])('impide duplicar %s', async (caso) => {
      await aislado(async (tx, f) => {
        if (
          ['referencia', 'instruccion', 'checkout', 'clave-recepcion'].includes(
            caso,
          )
        ) {
          const i = await tx.instruccionPago.create({
            data: {
              metodoConfiguradoId: f.i.metodoConfiguradoId,
              metodo: 'YAPE',
              claveSolicitud: randomUUID(),
              solicitudHash: 'a'.repeat(64),
              preparacionHash: 'b'.repeat(64),
              claveCreacionPedido:
                caso === 'checkout' ? f.r.claveCreacionPedido : randomUUID(),
              usuarioId: f.cliente.id,
              importeReferencia: '106',
              respuesta: {},
            },
          });
          await expect(
            tx.recepcionCompra.create({
              data: {
                referencia:
                  caso === 'referencia'
                    ? f.r.referencia
                    : 'REC-' + randomBytes(8).toString('hex').toUpperCase(),
                instruccionId: caso === 'instruccion' ? f.i.id : i.id,
                claveCreacionPedido:
                  caso === 'instruccion'
                    ? f.i.claveCreacionPedido
                    : i.claveCreacionPedido,
                claveSolicitud:
                  caso === 'clave-recepcion'
                    ? f.r.claveSolicitud
                    : randomUUID(),
                solicitudHash: 'a'.repeat(64),
                motivos: [],
              },
            }),
          ).rejects.toThrow();
        } else if (
          [
            'clave-comprobante',
            'version-comprobante',
            'archivo-comprobante',
          ].includes(caso)
        ) {
          await expect(
            tx.comprobanteRecepcionCompra.create({
              data: {
                recepcionId: f.r.id,
                version: caso === 'version-comprobante' ? 1 : 2,
                claveSolicitud:
                  caso === 'clave-comprobante'
                    ? f.c.claveSolicitud
                    : randomUUID(),
                solicitudHash: 'a'.repeat(64),
                archivoClave:
                  caso === 'archivo-comprobante'
                    ? f.c.archivoClave
                    : 'comprobantes/' + randomUUID() + '.png',
                archivoSha256Original: 'a'.repeat(64),
                archivoSha256: 'b'.repeat(64),
                nombreArchivo: 'otro.png',
                formato: 'image/png',
                tamanoBytes: 100,
              },
            }),
          ).rejects.toThrow();
        } else {
          const copia = datosCopia(f);
          if (caso === 'archivo-copia')
            await tx.operacionRecepcionCompra.update({
              where: { id: f.op.id },
              data: copia,
            });
          await expect(
            tx.operacionRecepcionCompra.create({
              data: {
                recepcionId: f.r.id,
                comprobanteId: f.c.id,
                claveSolicitud:
                  caso === 'clave-operacion'
                    ? f.op.claveSolicitud
                    : randomUUID(),
                solicitudHash: 'a'.repeat(64),
                accion: 'PROCESAR',
                actor: 'SISTEMA',
                versionEsperada: 1,
                antes: {},
                ...(caso === 'archivo-copia' ? copia : {}),
              },
            }),
          ).rejects.toThrow();
        }
      });
    });

    it.each([
      'instruccion-checkout',
      'comprobante-pendiente',
      'comprobante-ajeno',
      'operacion-ajena',
      'contenido-copia',
      'pago-ajeno',
      'pedido-ajeno',
      'origen-pago-ajeno',
      'origen-hash',
      'origen-tamano',
      'origen-formato',
    ])('rechaza vínculo cruzado %s', async (caso) => {
      await aislado(async (tx, f) => {
        if (caso === 'instruccion-checkout')
          await expect(
            tx.recepcionCompra.update({
              where: { id: f.r.id },
              data: { claveCreacionPedido: randomUUID() },
            }),
          ).rejects.toThrow();
        if (caso === 'comprobante-pendiente') {
          const c = await tx.comprobanteRecepcionCompra.create({
            data: {
              recepcionId: f.r.id,
              version: 2,
              claveSolicitud: randomUUID(),
              solicitudHash: 'a'.repeat(64),
              archivoClave: 'comprobantes/' + randomUUID() + '.png',
              archivoSha256Original: 'a'.repeat(64),
              archivoSha256: 'b'.repeat(64),
              nombreArchivo: 'pendiente.png',
              formato: 'image/png',
              tamanoBytes: 100,
            },
          });
          await expect(
            tx.recepcionCompra.update({
              where: { id: f.r.id },
              data: { comprobanteActualId: c.id },
            }),
          ).rejects.toThrow();
        }
        if (['comprobante-ajeno', 'operacion-ajena'].includes(caso)) {
          const i = await tx.instruccionPago.create({
            data: {
              metodoConfiguradoId: f.i.metodoConfiguradoId,
              metodo: 'YAPE',
              claveSolicitud: randomUUID(),
              solicitudHash: 'a'.repeat(64),
              preparacionHash: 'b'.repeat(64),
              claveCreacionPedido: randomUUID(),
              usuarioId: f.cliente.id,
              importeReferencia: '106',
              respuesta: {},
            },
          });
          const r = await tx.recepcionCompra.create({
            data: {
              referencia: 'REC-' + randomBytes(8).toString('hex').toUpperCase(),
              instruccionId: i.id,
              claveCreacionPedido: i.claveCreacionPedido,
              claveSolicitud: randomUUID(),
              solicitudHash: 'a'.repeat(64),
              motivos: [],
            },
          });
          if (caso === 'comprobante-ajeno')
            await expect(
              tx.recepcionCompra.update({
                where: { id: r.id },
                data: {
                  estado: 'RECIBIDA',
                  comprobanteActualId: f.c.id,
                  recibidaEn: new Date(),
                  respuesta: {},
                },
              }),
            ).rejects.toThrow();
          else
            await expect(
              tx.operacionRecepcionCompra.update({
                where: { id: f.op.id },
                data: { recepcionId: r.id },
              }),
            ).rejects.toThrow();
        }
        if (caso === 'contenido-copia')
          await expect(
            tx.operacionRecepcionCompra.update({
              where: { id: f.op.id },
              data: { ...datosCopia(f), archivoPedidoSha256: '0'.repeat(64) },
            }),
          ).rejects.toThrow();
        if (
          [
            'pago-ajeno',
            'pedido-ajeno',
            'origen-pago-ajeno',
            'origen-hash',
            'origen-tamano',
            'origen-formato',
          ].includes(caso)
        ) {
          const { pago } = await vincular(tx, f),
            otro = await pedido(tx, f),
            otroPago = await tx.pagoPedido.create({
              data: { pedidoId: otro.id, metodo: 'YAPE' },
            });
          if (caso === 'pago-ajeno')
            await expect(
              tx.recepcionCompra.update({
                where: { id: f.r.id },
                data: { pagoId: otroPago.id },
              }),
            ).rejects.toThrow();
          if (caso === 'pedido-ajeno')
            await expect(
              tx.recepcionCompra.update({
                where: { id: f.r.id },
                data: { pedidoId: otro.id },
              }),
            ).rejects.toThrow();
          if (caso.startsWith('origen-')) {
            const d = datosComprobante(
              f,
              caso === 'origen-pago-ajeno' ? otroPago.id : pago.id,
            );
            if (caso === 'origen-hash') d.archivoSha256 = '0'.repeat(64);
            if (caso === 'origen-tamano') d.tamanoBytes++;
            if (caso === 'origen-formato') d.formato = 'image/webp';
            await expect(
              tx.comprobantePago.create({ data: d }),
            ).rejects.toThrow();
          }
        }
      });
    });
    it('un comprobante pendiente no puede vincularse a pago destino', async () => {
      await aislado(async (tx, f) => {
        const p = await pedido(tx, f),
          pg = await tx.pagoPedido.create({
            data: { pedidoId: p.id, metodo: 'YAPE' },
          });
        await expect(
          tx.comprobanteRecepcionCompra.update({
            where: { id: f.c.id },
            data: { pagoDestinoId: pg.id },
          }),
        ).rejects.toThrow();
      }, false);
    });
    it('no permite cambiar contenido ni desvincular un origen ya usado por un pago', async () => {
      await aislado(async (tx, f) => {
        const { pago } = await vincular(tx, f);
        await tx.comprobantePago.create({ data: datosComprobante(f, pago.id) });
        await expect(
          tx.comprobanteRecepcionCompra.update({
            where: { id: f.c.id },
            data: { archivoSha256: '0'.repeat(64) },
          }),
        ).rejects.toThrow();
        await expect(
          tx.comprobanteRecepcionCompra.update({
            where: { id: f.c.id },
            data: { pagoDestinoId: null },
          }),
        ).rejects.toThrow();
      });
    });
    it.each([
      'recepcion',
      'instruccion',
      'archivo',
      'responsable',
      'pago',
      'pedido',
    ])('conserva historial con RESTRICT al borrar %s', async (caso) => {
      await aislado(async (tx, f) => {
        const { p, pago } = await vincular(tx, f);
        await tx.comprobantePago.create({ data: datosComprobante(f, pago.id) });
        if (caso === 'recepcion')
          await expect(
            tx.recepcionCompra.delete({ where: { id: f.r.id } }),
          ).rejects.toThrow();
        if (caso === 'instruccion')
          await expect(
            tx.instruccionPago.delete({ where: { id: f.i.id } }),
          ).rejects.toThrow();
        if (caso === 'archivo')
          await expect(
            tx.comprobanteRecepcionCompra.delete({ where: { id: f.c.id } }),
          ).rejects.toThrow();
        if (caso === 'responsable')
          await expect(
            tx.usuario.delete({ where: { id: f.cliente.id } }),
          ).rejects.toThrow();
        if (caso === 'pago')
          await expect(
            tx.pagoPedido.delete({ where: { id: pago.id } }),
          ).rejects.toThrow();
        if (caso === 'pedido')
          await expect(
            tx.pedido.delete({ where: { id: p.id } }),
          ).rejects.toThrow();
      });
    });

    const recepcionInvalida = [
      ['id', 'x'],
      ['clave_solicitud', 'x'],
      ['solicitud_hash', 'A'.repeat(64)],
      ['referencia', 'SOHO-AAAAAAAAAAAAAAAA'],
      ['referencia', 'REC-aaaaaaaaaaaaaaaa'],
      ['version', 0],
      ['estado', 'RECIBIENDO'],
      ['estado_comprobante_actual', 'PENDIENTE'],
      ['recibida_en', null],
      ['respuesta', 'null'],
      ['respuesta', '[]'],
      ['motivos', 'null'],
      ['motivos', '["STOCK_INSUFICIENTE"]'],
      ['estado', 'PEDIDO_CREADO'],
    ] as const;
    it.each(recepcionInvalida)('rechaza recepción %s=%s', async (campo, v) => {
      await aislado(async (tx, f) => {
        await expect(
          tx.$executeRaw(
            Prisma.sql`UPDATE recepciones_compra SET ${Prisma.raw(campo)}=${v} WHERE id=${f.r.id}`,
          ),
        ).rejects.toThrow();
      });
    });
    it.each([
      '[]',
      'null',
      '["DESCONOCIDO"]',
      '["STOCK_INSUFICIENTE","STOCK_INSUFICIENTE"]',
      '{"codigo":"STOCK_INSUFICIENTE"}',
    ])('rechaza motivos de atención %s', async (motivos) => {
      await aislado(async (tx, f) => {
        await expect(
          tx.$executeRaw`UPDATE recepciones_compra SET estado='REQUIERE_ATENCION', motivos=${motivos} WHERE id=${f.r.id}`,
        ).rejects.toThrow();
      });
    });
    const archivoInvalido = [
      ['id', 'x'],
      ['clave_solicitud', 'x'],
      ['version', 0],
      ['solicitud_hash', 'A'.repeat(64)],
      ['archivo_sha256_original', 'x'],
      ['archivo_sha256', 'x'],
      ['archivo_clave', '../recibo.png'],
      ['archivo_clave', 'https://ajeno.test/recibo.png'],
      [
        'archivo_clave',
        'comprobantes/00000000-0000-4000-8000-000000000000.jpg',
      ],
      ['nombre_archivo', ' '],
      ['nombre_archivo', 'recibo\n.png'],
      ['formato', 'image/svg+xml'],
      ['tamano_bytes', 0],
      ['tamano_bytes', 5242881],
      ['numero_operacion', 'abc'],
      ['numero_operacion', ''],
      ['confirmado_en', null],
      ['estado_archivo', 'PENDIENTE'],
      ['token_escritura', randomUUID()],
      ['ultima_incidencia', ' '],
    ] as const;
    it.each(archivoInvalido)('rechaza archivo %s=%s', async (campo, v) => {
      await aislado(async (tx, f) => {
        await expect(
          tx.$executeRaw(
            Prisma.sql`UPDATE comprobantes_recepcion_compra SET ${Prisma.raw(campo)}=${v} WHERE id=${f.c.id}`,
          ),
        ).rejects.toThrow();
      });
    });
    const operacionInvalida = [
      ['id', 'x'],
      ['clave_solicitud', 'x'],
      ['solicitud_hash', 'x'],
      ['version_esperada', 0],
      ['antes', 'null'],
      ['antes', '[]'],
      ['motivo', ' '],
      ['mensaje', '\n'],
      ['accion', 'REGISTRAR_PEDIDO'],
      ['accion', 'SOLICITAR_CORRECCION'],
      ['actor', 'SISTEMA'],
      ['responsable_id', null],
      ['estado', 'CONFIRMADA'],
      ['estado', 'RECHAZADA'],
      ['respuesta', '{}'],
      ['version_resultante', 1],
      ['codigo_http', 200],
      [
        'archivo_pedido_clave',
        'comprobantes/00000000-0000-4000-8000-000000000000.png',
      ],
      ['token_proceso', randomUUID()],
      ['ultima_incidencia', ''],
    ] as const;
    it.each(operacionInvalida)('rechaza operación %s=%s', async (campo, v) => {
      await aislado(async (tx, f) => {
        await expect(
          tx.$executeRaw(
            Prisma.sql`UPDATE operaciones_recepcion_compra SET ${Prisma.raw(campo)}=${v} WHERE id=${f.op.id}`,
          ),
        ).rejects.toThrow();
      });
    });
    it.each(['archivo', 'operacion', 'acceso', 'confirmacion'])(
      'rechaza fechas incoherentes de %s',
      async (caso) => {
        await aislado(async (tx, f) => {
          const antes = new Date('2000-01-01T00:00:00Z');
          if (caso === 'archivo')
            await expect(
              tx.comprobanteRecepcionCompra.update({
                where: { id: f.c.id },
                data: { confirmadoEn: antes },
              }),
            ).rejects.toThrow();
          if (caso === 'operacion')
            await expect(
              tx.operacionRecepcionCompra.update({
                where: { id: f.op.id },
                data: {
                  tokenProceso: randomUUID(),
                  bloqueoProcesoHasta: antes,
                },
              }),
            ).rejects.toThrow();
          if (caso === 'acceso')
            await expect(
              tx.recepcionCompra.update({
                where: { id: f.r.id },
                data: { accesoInvitadoExpiraEn: antes },
              }),
            ).rejects.toThrow();
          if (caso === 'confirmacion')
            await expect(
              tx.recepcionCompra.update({
                where: { id: f.r.id },
                data: { recibidaEn: antes },
              }),
            ).rejects.toThrow();
        });
      },
    );
    it('admite leases completos pendientes y los exige libres al finalizar', async () => {
      await aislado(async (tx, f) => {
        await tx.comprobanteRecepcionCompra.update({
          where: { id: f.c.id },
          data: {
            tokenEscritura: randomUUID(),
            bloqueoEscrituraHasta: new Date(Date.now() + 60000),
            intentosEscritura: 1,
          },
        });
        await tx.operacionRecepcionCompra.update({
          where: { id: f.op.id },
          data: {
            tokenProceso: randomUUID(),
            bloqueoProcesoHasta: new Date(Date.now() + 60000),
            intentosProceso: 1,
          },
        });
        await expect(
          tx.operacionRecepcionCompra.update({
            where: { id: f.op.id },
            data: {
              estado: 'CONFIRMADA',
              versionResultante: 2,
              despues: {},
              respuesta: {},
              codigoHttp: 200,
              finalizadoEn: new Date(),
            },
          }),
        ).rejects.toThrow();
      }, false);
    });
    it('exige ADMIN declarado, motivo y mensaje para una solicitud de corrección', async () => {
      await aislado(async (tx, f) => {
        await tx.operacionRecepcionCompra.update({
          where: { id: f.op.id },
          data: {
            accion: 'SOLICITAR_CORRECCION',
            actor: 'ADMIN',
            responsableId: f.admin.id,
            motivo: 'Comprobante ilegible',
            mensaje: 'Adjunta una imagen legible de la misma transferencia.',
          },
        });
        await expect(
          tx.operacionRecepcionCompra.update({
            where: { id: f.op.id },
            data: { mensaje: null },
          }),
        ).rejects.toThrow();
      });
    });
    it('rechaza resultado confirmado con salto de versión, HTTP de error o copia pendiente', async () => {
      await aislado(async (tx, f) => {
        const final = {
          estado: 'CONFIRMADA' as const,
          versionResultante: 2,
          despues: {},
          respuesta: {},
          codigoHttp: 200,
          finalizadoEn: new Date(),
        };
        await expect(
          tx.operacionRecepcionCompra.update({
            where: { id: f.op.id },
            data: { ...final, versionResultante: 4 },
          }),
        ).rejects.toThrow();
        await expect(
          tx.operacionRecepcionCompra.update({
            where: { id: f.op.id },
            data: { ...final, codigoHttp: 409 },
          }),
        ).rejects.toThrow();
        await expect(
          tx.operacionRecepcionCompra.update({
            where: { id: f.op.id },
            data: { ...final, ...datosCopia(f) },
          }),
        ).rejects.toThrow();
      });
    });
  },
);
