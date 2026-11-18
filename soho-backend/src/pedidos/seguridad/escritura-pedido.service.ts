import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../../autenticacion/seguridad/configuracion-auth.js';
import type { IdentidadPedido } from './sesion-pedido.guard.js';
import { INCLUIR_ADMIN } from '../dto/respuesta-administracion.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';

@Injectable()
export class EscrituraPedidoService extends EscrituraAutorizadaService {
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(CONFIGURACION_AUTH) auth: ConfiguracionAuth,
  ) {
    super(prisma, auth);
  }

  async sesion(
    tx: Prisma.TransactionClient,
    identidad: IdentidadPedido,
    admin: boolean,
  ) {
    return this.comprobarSesion(tx, identidad.sesion, admin);
  }

  async bloquear(tx: Prisma.TransactionClient, codigo: string) {
    await tx.$queryRaw`SELECT id FROM pedidos WHERE codigo = ${codigo} FOR UPDATE`;
    const p = await tx.pedido.findUnique({
      where: { codigo },
      include: INCLUIR_ADMIN,
    });
    if (!p || !p.pago) throw new NotFoundException('Pedido no encontrado.');
    await tx.$queryRaw`SELECT id FROM pagos_pedido WHERE id = ${p.pago.id} FOR UPDATE`;
    return p;
  }
}
