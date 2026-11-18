export type AccionEntrega = 'PREPARAR' | 'ENVIAR' | 'ENTREGAR';

export class CambioEntregaDto {
  versionPedido!: number;
  nota!: string;
  transportista?: string;
  referenciaSeguimiento?: string;
  confirmado?: true;
}
