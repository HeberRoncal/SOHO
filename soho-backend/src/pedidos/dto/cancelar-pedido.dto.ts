export class CancelarPedidoDto {
  versionPedido!: number;
  versionPago!: number;
  confirmado!: true;
  motivo!: string;
  decisionReservasConsultadas?: 'LIBERAR' | 'CONSERVAR';
}
