import { readFile, writeFile } from 'node:fs/promises';
import { PlanCorrespondenciaProductos } from '../src/productos/migracion/plan-correspondencia-productos/plan-correspondencia-productos.js';
import { crearClientePrisma } from '../src/prisma/cliente-prisma.js';
import { LecturaCatalogo } from '../src/productos/migracion/lectura-catalogo.js';

// No carga .env automáticamente ni arranca la aplicación o sus trabajadores.
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const desdeBd = args[0] === '--desde-bd';
  const desdeArchivo = args[0] === '--entrada';
  const posicionSalida = desdeBd ? 1 : 2;
  if (
    (!desdeBd && !desdeArchivo) ||
    args[posicionSalida] !== '--salida' ||
    !args[posicionSalida + 1] ||
    args.length !== posicionSalida + 2
  )
    throw Error(
      'Uso: --entrada instantanea.json --salida plan.json, o --desde-bd --salida plan.json con DATABASE_URL explícita.',
    );
  let entrada: unknown;
  if (desdeArchivo) entrada = JSON.parse(await readFile(args[1], 'utf8'));
  else {
    if (!process.env.DATABASE_URL)
      throw Error(
        'La lectura requiere DATABASE_URL explícita; no se cargó .env.',
      );
    const prisma = crearClientePrisma(process.env.DATABASE_URL);
    try {
      entrada = await prisma.$transaction(
        (tx) => new LecturaCatalogo().leer(tx),
        { isolationLevel: 'RepeatableRead', timeout: 30000 },
      );
    } finally {
      await prisma.$disconnect();
    }
  }
  const plan = new PlanCorrespondenciaProductos().crear(entrada);
  await writeFile(
    args[posicionSalida + 1],
    JSON.stringify(plan, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      aptoParaRevision: plan.aptoParaRevision,
      productos: plan.productos.length,
      incidencias: plan.incidencias.length,
      huellaOrigen: plan.huellaOrigen,
    }),
  );
  if (!plan.aptoParaRevision) process.exitCode = 2;
}
main().catch(() => {
  console.error(
    'No se pudo generar el plan. Comprueba argumentos, formato, conexión explícita y que el archivo de salida no exista. No se realizaron escrituras en MySQL.',
  );
  process.exitCode = 1;
});
