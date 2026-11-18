export class ConfiguracionCheckoutPagos {
  readonly habilitada: boolean;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.habilitada = env.PAGOS_CHECKOUT_ACTIVO === 'true';
  }
}
