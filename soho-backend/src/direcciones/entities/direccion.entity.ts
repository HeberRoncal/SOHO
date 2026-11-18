import type { Prisma } from '../../generated/prisma/client.js';

export const seleccionDireccion = {
  id: true,
  etiqueta: true,
  destinatario: true,
  celular: true,
  distrito: true,
  direccion: true,
  referencia: true,
  predeterminada: true,
} as const satisfies Prisma.DireccionUsuarioSelect;
