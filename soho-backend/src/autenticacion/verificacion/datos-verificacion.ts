import { BadRequestException } from '@nestjs/common';
import { objeto } from '../acceso/datos-auth.js';

export const FORMATO_TOKEN_VERIFICACION =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
export const enlaceVerificacionInvalido = () =>
  new BadRequestException({
    codigo: 'VERIFICACION_ENLACE_INVALIDO',
    message:
      'Este enlace no es válido, venció o ya fue utilizado. Solicita otro desde tu cuenta.',
  });
export function leerVerificacion(valor: unknown) {
  const datos = objeto(valor, ['token']);
  if (
    typeof datos.token !== 'string' ||
    !FORMATO_TOKEN_VERIFICACION.test(datos.token)
  )
    throw enlaceVerificacionInvalido();
  return { token: datos.token };
}
