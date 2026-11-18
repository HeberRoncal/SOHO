import { resolve } from 'node:path';

export const MAXIMO_COMPROBANTE = 5 * 1024 * 1024;
export const MAXIMO_BASE64 = 4 * Math.ceil(MAXIMO_COMPROBANTE / 3);
export const UUID_PEDIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class ConfiguracionPedidos {
  readonly directorio: string;
  readonly accesoInvitadoMs = 30 * 24 * 60 * 60 * 1000;
  readonly vencimientosAutomaticos: boolean;

  constructor(entorno: NodeJS.ProcessEnv = process.env) {
    this.directorio = resolve(entorno.PEDIDOS_DIRECTORIO_PRIVADO || '.privado');
    this.vencimientosAutomaticos =
      (entorno.NODE_ENV ?? process.env.NODE_ENV) !== 'test';
  }
}
