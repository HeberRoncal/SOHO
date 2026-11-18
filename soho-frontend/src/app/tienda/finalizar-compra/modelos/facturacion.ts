export interface Facturacion {
  readonly tipo: 'boleta' | 'factura';
  readonly documento: 'DNI' | 'CE' | 'PAS';
  readonly numero: string;
  readonly ruc: string;
  readonly razonSocial: string;
  readonly domicilioFiscal: string;
}

export const FACTURACION_INICIAL: Facturacion = {
  tipo: 'boleta',
  documento: 'DNI',
  numero: '',
  ruc: '',
  razonSocial: '',
  domicilioFiscal: '',
};

export function erroresFacturacion(datos: Facturacion): Partial<Record<keyof Facturacion, string>> {
  const errores: Partial<Record<keyof Facturacion, string>> = {};
  if (datos.tipo === 'boleta') {
    const patrones = { DNI: /^\d{8}$/, CE: /^[A-Za-z0-9]{9,12}$/, PAS: /^[A-Za-z0-9]{6,12}$/ };
    if (!patrones[datos.documento]?.test(datos.numero.trim()))
      errores.numero =
        datos.documento === 'DNI'
          ? 'El DNI debe tener 8 dígitos.'
          : 'Revisa el número de documento.';
  } else if (datos.tipo === 'factura') {
    if (!/^(10|15|17|20)\d{9}$/.test(datos.ruc.trim()))
      errores.ruc = 'Ingresa un RUC válido de 11 dígitos.';
    if (!datos.razonSocial.trim() || datos.razonSocial.length > 160)
      errores.razonSocial = 'Ingresa la razón social (máximo 160 caracteres).';
    if (datos.domicilioFiscal.trim().length < 6 || datos.domicilioFiscal.length > 180)
      errores.domicilioFiscal = 'Ingresa el domicilio fiscal.';
  } else errores.tipo = 'Selecciona boleta o factura.';
  return errores;
}
