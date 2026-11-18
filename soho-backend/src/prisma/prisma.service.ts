import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { crearAdaptadorMySql } from './cliente-prisma.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor() {
    super({ adapter: crearAdaptadorMySql() });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      await this.$disconnect().catch(() => undefined);
      throw new Error(
        'No se pudo conectar a MySQL. Revisa DATABASE_URL y que el servidor este disponible.',
      );
    }
  }

  // Los trabajadores terminan en onModuleDestroy antes de cerrar su conexión.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
