import {
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { crearConfiguracionAuth } from '../autenticacion/seguridad/configuracion-auth.js';
import { ConfiguracionPedidos } from './configuracion-pedidos.js';
import { ComprobantesPrivadosService } from './archivos/comprobantes-privados.service.js';
import { PedidosService } from './pedidos.service.js';
import { PreparacionPedidoService } from './preparacion/preparacion-pedido.service.js';
import { ConfiguracionCheckoutPagos } from './preparacion/configuracion-checkout-pagos.js';
import { RegistroPedidoService } from './preparacion/registro-pedido.service.js';
import { datosPedido } from '../../test/pedidos-fixtures.js';

describe('Fallo de transacción y conciliación de archivos de pedidos', () => {
  const configurar = () => {
    const prisma = {
      pedido: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi
        .fn()
        .mockRejectedValue(new ConflictException('Cambio concurrente')),
    };
    const archivos = {
      decodificar: vi.fn().mockReturnValue(Buffer.from('imagen')),
      preparar: vi.fn().mockResolvedValue({}),
      guardar: vi.fn().mockResolvedValue({ clave: 'comprobantes/prueba.png' }),
      eliminar: vi.fn().mockResolvedValue(undefined),
    };
    const servicio = new PedidosService(
      prisma as unknown as PrismaService,
      archivos as unknown as ComprobantesPrivadosService,
      new ConfiguracionPedidos({}),
      crearConfiguracionAuth({}),
      new PreparacionPedidoService(),
      new ConfiguracionCheckoutPagos({}),
      new RegistroPedidoService(new ConfiguracionPedidos({})),
    );
    return { prisma, archivos, servicio };
  };
  const identidad = { accesoInvitadoHash: 'a'.repeat(64) };
  it('retira el archivo si confirma que la transacción no creó el pedido', async () => {
    const { servicio, archivos } = configurar();
    await expect(
      servicio.crear(await datosPedido(), identidad),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(archivos.eliminar).toHaveBeenCalledExactlyOnceWith(
      'comprobantes/prueba.png',
    );
  });
  it('conserva el archivo si no puede consultar el resultado del COMMIT', async () => {
    const { servicio, archivos, prisma } = configurar();
    prisma.pedido.findUnique
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(Error('Base inaccesible'));
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(
      servicio.crear(await datosPedido(), identidad),
    ).rejects.toThrow('misma clave de creación');
    expect(archivos.eliminar).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it('no guarda archivos cuando ya falla la consulta inicial de idempotencia', async () => {
    const { servicio, archivos, prisma } = configurar();
    prisma.pedido.findUnique.mockRejectedValue(Error('Base inaccesible'));
    await expect(
      servicio.crear(await datosPedido(), identidad),
    ).rejects.toThrow('Base inaccesible');
    expect(archivos.guardar).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('no abre una transacción cuando falla el almacenamiento privado', async () => {
    const { servicio, archivos, prisma } = configurar();
    archivos.guardar.mockRejectedValue(
      new ServiceUnavailableException('Disco inaccesible'),
    );
    await expect(
      servicio.crear(await datosPedido(), identidad),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('acota los reintentos de deadlock y retira el archivo tras agotar tres intentos', async () => {
    const { servicio, archivos, prisma } = configurar();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Deadlock', {
        code: 'P2034',
        clientVersion: '7.10.1',
      }),
    );
    await expect(
      servicio.crear(await datosPedido(), identidad),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(archivos.guardar).toHaveBeenCalledTimes(1);
    expect(archivos.eliminar).toHaveBeenCalledTimes(1);
  });
  it('reintenta deadlocks SQL 1213 sin volver a guardar el comprobante', async () => {
    const { servicio, archivos, prisma } = configurar();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Raw SQL deadlock', {
        code: 'P2010',
        clientVersion: '7.10.1',
        meta: {
          driverAdapterError: {
            cause: { kind: 'TransactionWriteConflict', originalCode: '1213' },
          },
        },
      }),
    );
    await expect(
      servicio.crear(await datosPedido(), identidad),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(archivos.guardar).toHaveBeenCalledTimes(1);
    expect(archivos.eliminar).toHaveBeenCalledTimes(1);
  });
});
