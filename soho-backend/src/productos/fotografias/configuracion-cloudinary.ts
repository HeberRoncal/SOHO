import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const HTTP_CLOUDINARY = Symbol('HTTP_CLOUDINARY');
export const MAXIMO_FOTOGRAFIA = 5 * 1024 * 1024;
export const PLAZO_CARGA = 120_000;
export const PLAZO_HUERFANO = 24 * 60 * 60 * 1000;

export class ConfiguracionCloudinary {
  readonly cloudName: string;
  readonly habilitada: boolean;
  readonly procesadorActivo: boolean;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.cloudName = env.CLOUDINARY_CLOUD_NAME?.trim() ?? '';
    this.apiKey = env.CLOUDINARY_API_KEY?.trim() ?? '';
    this.apiSecret = env.CLOUDINARY_API_SECRET?.trim() ?? '';
    this.habilitada =
      /^[a-z0-9_-]{1,80}$/i.test(this.cloudName) &&
      /^\d{1,40}$/.test(this.apiKey) &&
      this.apiSecret.length > 0 &&
      !/[\s\p{Cc}\p{Cf}]/u.test(this.apiSecret);
    this.procesadorActivo =
      this.habilitada &&
      env.NODE_ENV !== 'test' &&
      env.CLOUDINARY_PROCESADOR_ACTIVO !== 'false';
  }
  exigir() {
    if (!this.habilitada)
      throw new ServiceUnavailableException(
        'Completa la configuración de Cloudinary en el backend.',
      );
  }
  autorizacion(): string {
    this.exigir();
    return (
      'Basic ' +
      Buffer.from(this.apiKey + ':' + this.apiSecret).toString('base64')
    );
  }
  autenticarFormulario(campos: Record<string, string>): Record<string, string> {
    this.exigir();
    const texto = Object.keys(campos)
      .sort()
      .map((k) => k + '=' + campos[k])
      .join('&');
    return {
      ...campos,
      api_key: this.apiKey,
      signature: createHash('sha256')
        .update(texto + this.apiSecret)
        .digest('hex'),
    };
  }
}
