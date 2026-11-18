import 'dotenv/config';
import { crearClientePrisma } from '../src/prisma/cliente-prisma.js';

const marcas = [
  {
    codigo: 'AS',
    nombre: 'ASICS',
    slug: 'asics',
    logotipo: '/imagenes/marcas/Logo ASICS.svg',
  },
  {
    codigo: 'RB',
    nombre: 'Reebok',
    slug: 'reebok',
    logotipo: '/imagenes/marcas/Logo REEBOK.svg',
  },
  {
    codigo: 'SK',
    nombre: 'Skechers',
    slug: 'skechers',
    logotipo: '/imagenes/marcas/Logo SKECHERS.svg',
  },
  {
    codigo: 'UA',
    nombre: 'Under Armour',
    slug: 'under-armour',
    logotipo: '/imagenes/marcas/Logo UNDERARMOUR.svg',
  },
];

const prisma = crearClientePrisma();
try {
  const resultado = await prisma.$transaction(async (tx) => {
    let orden =
      (await tx.marca.aggregate({ _max: { orden: true } }))._max.orden ?? -1;
    const creadas: string[] = [],
      conservadas: string[] = [];
    for (const marca of marcas) {
      const existentes = await tx.marca.findMany({
        where: {
          OR: [
            { codigo: marca.codigo },
            { nombre: marca.nombre },
            { slug: marca.slug },
          ],
        },
      });
      if (existentes.length) {
        if (
          existentes.length !== 1 ||
          existentes[0].codigo !== marca.codigo ||
          existentes[0].slug !== marca.slug ||
          existentes[0].nombre.toLowerCase() !== marca.nombre.toLowerCase()
        ) {
          throw new Error(
            'Conflicto de identidad en la marca ' +
              marca.nombre +
              '. No se aplicaron cambios.',
          );
        }
        conservadas.push(marca.nombre);
      } else {
        await tx.marca.create({
          data: { ...marca, activa: true, altoLogotipo: 72, orden: ++orden },
        });
        creadas.push(marca.nombre);
      }
    }
    return { creadas, conservadas };
  });
  console.log(JSON.stringify(resultado));
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'No se pudieron registrar las marcas.',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
