import type {
  AccionCancelacionReserva,
  AccionVencimientoReserva,
  ModoReservaInventario,
} from '../../generated/prisma/client.js';

export class ActualizarConfiguracionReservasDto {
  version: number;
  confirmado: true;
  modo: ModoReservaInventario;
  horas: number | null;
  accionVencimiento: AccionVencimientoReserva | null;
  accionCancelacion: AccionCancelacionReserva;
}
