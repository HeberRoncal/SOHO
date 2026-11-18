import 'dotenv/config';
import { input, password } from '@inquirer/prompts';
import { HttpException } from '@nestjs/common';
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import { crearAdministrador } from '../src/autenticacion/acceso/crear-administrador.js';
import { crearClientePrisma } from '../src/prisma/cliente-prisma.js';

if (process.argv.includes('--help')) {
  console.log(
    'npm.cmd run admin:crear\nSolicita nombres, apellidos, correo y contraseña oculta. Crea una cuenta ADMIN nueva; no modifica cuentas existentes.',
  );
} else {
  let prisma: ReturnType<typeof crearClientePrisma> | undefined;
  try {
    if (
      !process.stdin.isTTY ||
      !process.stdout.isTTY ||
      process.argv.length > 2
    ) {
      throw new Error(
        'Ejecuta el comando en una terminal interactiva sin argumentos. La contraseña no se acepta por argumentos ni variables de entorno.',
      );
    }
    const nombres = await input({ message: 'Nombres:' });
    const apellidos = await input({ message: 'Apellidos:' });
    const correo = await input({ message: 'Correo:' });
    const clave = await password({
      message: 'Contraseña (15 a 128 caracteres):',
      mask: '*',
    });
    const confirmacion = await password({
      message: 'Repite la contraseña:',
      mask: '*',
    });
    if (clave !== confirmacion)
      throw new Error('Las contraseñas no coinciden.');
    prisma = crearClientePrisma();
    const usuario = await crearAdministrador(prisma, new ClavesService(), {
      nombres,
      apellidos,
      correo,
      clave,
    });
    console.log(`Administrador creado: ${usuario.correo}`);
  } catch (error) {
    const mensaje =
      error instanceof HttpException
        ? error.message
        : error instanceof Error &&
            (error.message.startsWith('Ejecuta el comando') ||
              error.message === 'Las contraseñas no coinciden.')
          ? error.message
          : 'No se pudo crear el administrador. Revisa la conexión, las migraciones y los datos introducidos.';
    console.error(mensaje);
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}
