import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';

export function obtenerUrlBaseDatos(valor = process.env.DATABASE_URL): string {
  const mensaje =
    'Configura DATABASE_URL con una conexion mysql:// valida y el nombre de la base de datos en .env.';
  if (!valor?.trim()) throw new Error(mensaje);

  try {
    const url = new URL(valor.trim());
    if (
      url.protocol !== 'mysql:' ||
      !url.hostname ||
      !url.username ||
      url.pathname.length <= 1 ||
      url.pathname.slice(1).includes('/') ||
      url.hash
    ) {
      throw new Error(mensaje);
    }
    // Valida los escapes sin registrar usuario, contraseña ni URL.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    const base = decodeURIComponent(url.pathname.slice(1));
    if (!base.trim() || base.includes('/')) throw new Error(mensaje);
    return url.toString();
  } catch {
    throw new Error(mensaje);
  }
}

export function crearAdaptadorMySql(url?: string): PrismaMariaDb {
  return new PrismaMariaDb(obtenerUrlBaseDatos(url));
}

export function crearClientePrisma(url?: string): PrismaClient {
  return new PrismaClient({ adapter: crearAdaptadorMySql(url) });
}
