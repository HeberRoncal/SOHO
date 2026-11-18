import 'dotenv/config';
import { crearClientePrisma } from '../src/prisma/cliente-prisma.js';
import { sembrarCatalogo } from './sembrar-catalogo.js';

async function main(): Promise<void> {
  const prisma = crearClientePrisma();
  try {
    const resultado = await sembrarCatalogo(prisma);
    console.log(
      `Catalogo de prueba: ${resultado.creados} productos creados; ${resultado.conservados} conservados.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(
    'No se pudo cargar el catalogo. Revisa la conexion, las migraciones y los posibles conflictos de identificadores. No se aplicaron cambios parciales.',
  );
  process.exitCode = 1;
});
