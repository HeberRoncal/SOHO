import { BadRequestException } from '@nestjs/common';
import { nombre, objeto } from '../acceso/datos-auth.js';

export interface PerfilGoogle {
  nombres: string;
  apellidos: string;
}
export function leerGoogle(valor: unknown) {
  const datos = objeto(valor, ['credential', 'perfil']);
  return {
    credential: credencial(datos.credential),
    perfil:
      datos.perfil === undefined ? undefined : leerPerfilGoogle(datos.perfil),
  };
}
export function leerVinculacionGoogle(valor: unknown) {
  const datos = objeto(valor, ['credential', 'clave']);
  if (
    typeof datos.clave !== 'string' ||
    !datos.clave ||
    Array.from(datos.clave).length > 128 ||
    Buffer.byteLength(datos.clave) > 512 ||
    datos.clave.includes('\0')
  ) {
    throw new BadRequestException('Introduce tu contraseña actual.');
  }
  return { credential: credencial(datos.credential), clave: datos.clave };
}
function credencial(valor: unknown): string {
  if (
    typeof valor !== 'string' ||
    valor.length > 8192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(valor)
  ) {
    throw new BadRequestException('La respuesta de Google no es válida.');
  }
  return valor;
}
export function leerPerfilGoogle(valor: unknown): PerfilGoogle {
  const datos = objeto(valor, ['nombres', 'apellidos']);
  return { nombres: nombre(datos.nombres), apellidos: nombre(datos.apellidos) };
}
