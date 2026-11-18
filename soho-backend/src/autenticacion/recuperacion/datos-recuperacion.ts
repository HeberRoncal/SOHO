import { BadRequestException } from '@nestjs/common';
import { clave, normalizarCorreo, objeto } from '../acceso/datos-auth.js';

export function leerSolicitudRecuperacion(valor: unknown) {
  const datos = objeto(valor, ['correo']);
  return { correo: normalizarCorreo(datos.correo) };
}
export function leerTokenRecuperacion(valor: unknown) {
  const datos = objeto(valor, ['token']);
  return { token: tokenRecuperacion(datos.token) };
}
export function leerRestablecimiento(valor: unknown) {
  const datos = objeto(valor, ['token', 'clave']);
  return {
    token: tokenRecuperacion(datos.token),
    clave: clave(datos.clave, 15),
  };
}
function tokenRecuperacion(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(valor)) {
    throw new BadRequestException({
      codigo: 'RECUPERACION_ENLACE_INVALIDO',
      message: 'Este enlace no es válido o ha vencido. Solicita uno nuevo.',
    });
  }
  return valor;
}
