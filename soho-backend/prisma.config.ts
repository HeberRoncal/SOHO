import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Validar y generar no necesitan conexión; los comandos de BD exigen esta variable.
    url: process.env.DATABASE_URL ?? '',
  },
});
