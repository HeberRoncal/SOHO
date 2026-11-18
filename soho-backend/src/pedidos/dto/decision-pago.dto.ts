export class DecisionPagoDto {
  versionPedido: number;
  versionPago: number;
  comprobanteId: string;
  accion: 'APROBADO' | 'OBSERVADO' | 'RECHAZADO';
  confirmado?: boolean;
  motivo?: 'ILEGIBLE' | 'MONTO' | 'INGRESO' | 'DATOS' | 'OTRO';
  mensaje?: string;
  solicitud?: 'LEGIBLE' | 'CORREGIDO';
}
