import { BadRequestException } from '@nestjs/common';

export interface DatosLogin {
  correo: string;
  clave: string;
}
export interface DatosRegistro extends DatosLogin {
  nombres: string;
  apellidos: string;
}
export interface DatosPerfil {
  nombres: string;
  apellidos: string;
}

export function objeto(
  valor: unknown,
  campos: string[],
): Record<string, unknown> {
  if (
    !valor ||
    typeof valor !== 'object' ||
    Array.isArray(valor) ||
    Object.keys(valor).some((campo) => !campos.includes(campo))
  ) {
    throw new BadRequestException('Los datos enviados no son válidos.');
  }
  return valor as Record<string, unknown>;
}

function texto(valor: unknown): string {
  if (typeof valor !== 'string' || /[\p{Cc}\p{Cf}]/u.test(valor)) {
    throw new BadRequestException('Los datos enviados no son válidos.');
  }
  return valor.trim();
}

export function normalizarCorreo(valor: unknown): string {
  const correo = texto(valor).toLowerCase();
  if (
    Array.from(correo).length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(correo)
  ) {
    throw new BadRequestException('Introduce un correo válido.');
  }
  return correo;
}

export function clave(valor: unknown, minimo: number): string {
  // La contraseña se conserva tal como se escribe, incluidos sus espacios.
  if (
    typeof valor !== 'string' ||
    Array.from(valor).length < minimo ||
    Array.from(valor).length > 128 ||
    Buffer.byteLength(valor) > 512 ||
    valor.includes('\0')
  ) {
    throw new BadRequestException(
      `La contraseña debe tener entre ${minimo} y 128 caracteres.`,
    );
  }
  return valor;
}

export function nombre(valor: unknown): string {
  const resultado = texto(valor);
  if (Array.from(resultado).length < 2 || Array.from(resultado).length > 80) {
    throw new BadRequestException(
      'Los nombres y apellidos deben tener entre 2 y 80 caracteres.',
    );
  }
  return resultado;
}

export function leerRegistro(valor: unknown): DatosRegistro {
  const datos = objeto(valor, ['nombres', 'apellidos', 'correo', 'clave']);
  return {
    nombres: nombre(datos.nombres),
    apellidos: nombre(datos.apellidos),
    correo: normalizarCorreo(datos.correo),
    clave: clave(datos.clave, 15),
  };
}

export function leerLogin(valor: unknown): DatosLogin {
  const datos = objeto(valor, ['correo', 'clave']);
  return {
    correo: normalizarCorreo(datos.correo),
    clave: clave(datos.clave, 1),
  };
}

export function leerPerfil(valor: unknown): DatosPerfil {
  const datos = objeto(valor, ['nombres', 'apellidos']);
  return {
    nombres: nombre(datos.nombres),
    apellidos: nombre(datos.apellidos),
  };
}
