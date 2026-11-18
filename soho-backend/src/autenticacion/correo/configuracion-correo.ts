import { isIP } from 'node:net';

export const CONFIGURACION_CORREO = Symbol('CONFIGURACION_CORREO');

export interface ConfiguracionCorreo {
  habilitado: boolean;
  origenTienda: string;
  smtp?: {
    host: string;
    puerto: number;
    seguro: boolean;
    usuario?: string;
    clave?: string;
    remitente: string;
    inseguroLocal: boolean;
  };
}

/** Una dirección única, sin listas, nombres visibles ni caracteres de cabecera. */
export function direccionCorreo(valor: string): boolean {
  return (
    Array.from(valor).length <= 254 &&
    /^[^\s@<>,;:"\\()[\]\p{Cc}\p{Cf}]+@[^\s@<>,;:"\\()[\]\p{Cc}\p{Cf}]+\.[^\s@<>,;:"\\()[\]\p{Cc}\p{Cf}]+$/u.test(
      valor,
    )
  );
}

export function crearConfiguracionCorreo(
  entorno: NodeJS.ProcessEnv = process.env,
  origenes?: ReadonlySet<string>,
): ConfiguracionCorreo {
  const produccion = entorno.NODE_ENV === 'production';
  const origenTienda =
    entorno.RECUPERACION_ORIGEN?.trim() ||
    (produccion ? '' : 'http://localhost:4200');
  const variables = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USUARIO',
    'SMTP_CLAVE',
    'SMTP_REMITENTE',
    'SMTP_PERMITIR_INSEGURO_LOCAL',
  ];
  const habilitado = variables.some((nombre) => !!entorno[nombre]);
  if (!habilitado) return { habilitado: false, origenTienda };
  try {
    const url = new URL(origenTienda);
    if (
      url.origin !== origenTienda ||
      !['http:', 'https:'].includes(url.protocol) ||
      (produccion && url.protocol !== 'https:') ||
      (origenes && !origenes.has(origenTienda))
    )
      throw new Error();
  } catch {
    throw new Error(
      'RECUPERACION_ORIGEN debe ser un origen válido permitido por AUTH_ORIGENES; en producción debe usar HTTPS.',
    );
  }
  const booleano = (valor: string | undefined, predeterminado = false) => {
    if (valor === undefined || valor === '') return predeterminado;
    if (valor !== 'true' && valor !== 'false')
      throw new Error('Las opciones booleanas SMTP deben usar true o false.');
    return valor === 'true';
  };
  const host = entorno.SMTP_HOST?.trim() || '';
  if (
    !host ||
    (!isIP(host) &&
      !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)) ||
    host.includes('..')
  ) {
    throw new Error(
      'SMTP_HOST debe contener un nombre de servidor o una IP válidos.',
    );
  }
  const seguro = booleano(entorno.SMTP_SECURE);
  const puertoTexto = entorno.SMTP_PORT || (seguro ? '465' : '587');
  const puerto = Number(puertoTexto);
  if (
    !/^\d+$/.test(puertoTexto) ||
    !Number.isInteger(puerto) ||
    puerto < 1 ||
    puerto > 65535
  ) {
    throw new Error('SMTP_PORT debe ser un puerto entre 1 y 65535.');
  }
  if (puerto === 465 && !seguro)
    throw new Error('El puerto SMTP 465 requiere SMTP_SECURE=true.');
  const local = ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase());
  const inseguroLocal = booleano(entorno.SMTP_PERMITIR_INSEGURO_LOCAL);
  if (inseguroLocal && (produccion || !local || seguro)) {
    throw new Error(
      'El SMTP sin TLS solo se permite explícitamente en loopback durante desarrollo o pruebas.',
    );
  }
  const usuario = entorno.SMTP_USUARIO;
  const clave = entorno.SMTP_CLAVE;
  if (
    !!usuario !== !!clave ||
    (usuario && /[\p{Cc}\p{Cf}]/u.test(usuario)) ||
    (clave && /[\r\n\0]/.test(clave)) ||
    (usuario?.length ?? 0) > 512 ||
    (clave?.length ?? 0) > 4096 ||
    (!local && (!usuario || !clave))
  ) {
    throw new Error(
      'Configura SMTP_USUARIO y SMTP_CLAVE conjuntamente; son obligatorios fuera de loopback.',
    );
  }
  const remitente = entorno.SMTP_REMITENTE?.trim() || '';
  if (!direccionCorreo(remitente))
    throw new Error(
      'SMTP_REMITENTE debe contener una única dirección de correo válida.',
    );
  return {
    habilitado: true,
    origenTienda,
    smtp: { host, puerto, seguro, usuario, clave, remitente, inseguroLocal },
  };
}
