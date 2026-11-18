import { readFile } from 'node:fs/promises';
import { crearClientePrisma } from '../src/prisma/cliente-prisma.js';
import { ConvertirCatalogo } from '../src/productos/migracion/convertir-catalogo.js';
import type { PlanCorrespondencia } from '../src/productos/migracion/modelos-correspondencia/modelos-correspondencia.interface.js';

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== '--manifiesto' ||
    !args[1] ||
    args[2] !== '--confirmar-mantenimiento'
  )
    throw Error(
      'Uso: --manifiesto plan-productos.json --confirmar-mantenimiento. Detén API y trabajadores antes de aplicar.',
    );
  if (!process.env.DATABASE_URL)
    throw Error(
      'Define explícitamente DATABASE_URL; no se carga .env automáticamente.',
    );
  const manifiesto = JSON.parse(
    await readFile(args[1], 'utf8'),
  ) as PlanCorrespondencia;
  const prisma = crearClientePrisma(process.env.DATABASE_URL);
  try {
    console.log(
      JSON.stringify(await new ConvertirCatalogo().aplicar(prisma, manifiesto)),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => {
  // Los errores del controlador pueden incluir datos de conexión. Solo mostrar
  // mensajes propios de revisión o de formato, nunca el objeto Prisma completo.
  const mensaje =
    error instanceof Error &&
    (error.name === 'AssertionError' ||
      error.message.startsWith('Uso:') ||
      error.message.startsWith('Define explícitamente'))
      ? error.message
      : 'No se completó la conversión. La transacción se revierte; revisa la migración, la conexión y el manifiesto.';
  console.error(mensaje);
  process.exitCode = 1;
});
