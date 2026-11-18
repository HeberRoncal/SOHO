import { DatosEntrega } from './datos-entrega';
import { erroresFacturacion } from './facturacion';

export type CampoEntrega = keyof DatosEntrega;
export type ErroresEntrega = Partial<Record<CampoEntrega, string>>;

export class ValidacionEntrega {
  static normalizar(datos: DatosEntrega): DatosEntrega {
    return {
      nombres: datos.nombres.trim(),
      apellidos: datos.apellidos.trim(),
      correo: datos.correo.trim(),
      celular: datos.celular.trim(),
      distrito: datos.distrito.trim(),
      direccion: datos.direccion.trim(),
      referencia: datos.referencia.trim(),
      ...(datos.destinatario?.trim() ? { destinatario: datos.destinatario.trim() } : {}),
      ...(datos.facturacion
        ? {
            facturacion: {
              ...datos.facturacion,
              numero: datos.facturacion.numero.trim(),
              ruc: datos.facturacion.ruc.trim(),
              razonSocial: datos.facturacion.razonSocial.trim(),
              domicilioFiscal: datos.facturacion.domicilioFiscal.trim(),
            },
          }
        : {}),
    };
  }

  static errores(datos: DatosEntrega): ErroresEntrega {
    const valor = this.normalizar(datos);
    const errores: ErroresEntrega = {};
    if (Array.from(valor.nombres).length < 2 || Array.from(valor.nombres).length > 80)
      errores.nombres = 'Ingresa tus nombres (entre 2 y 80 caracteres).';
    if (Array.from(valor.apellidos).length < 2 || Array.from(valor.apellidos).length > 80)
      errores.apellidos = 'Ingresa tus apellidos (entre 2 y 80 caracteres).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.correo) || valor.correo.length > 254)
      errores.correo = 'Ingresa un correo válido, como nombre@correo.com.';
    if (!/^9\d{8}$/.test(valor.celular)) errores.celular = 'Ingresa 9 dígitos, empezando por 9.';
    if (!valor.distrito) errores.distrito = 'Selecciona un distrito de entrega.';
    if (valor.direccion.length < 6 || valor.direccion.length > 180)
      errores.direccion = 'Ingresa la calle o avenida y el número de tu domicilio.';
    if (valor.referencia.length > 200)
      errores.referencia = 'La referencia debe tener como máximo 200 caracteres.';
    if (
      valor.destinatario &&
      (Array.from(valor.destinatario).length < 2 ||
        Array.from(valor.destinatario).length > 140 ||
        /[\p{Cc}\p{Cf}]/u.test(valor.destinatario))
    )
      errores.destinatario =
        'Indica el nombre completo de quien recibe (entre 2 y 140 caracteres).';
    if (!valor.destinatario && Array.from(`${valor.nombres} ${valor.apellidos}`).length > 140)
      errores.destinatario = 'Indica el nombre completo de quien recibe (máximo 140 caracteres).';
    if (valor.facturacion && Object.keys(erroresFacturacion(valor.facturacion)).length)
      errores.facturacion = 'Revisa los datos del comprobante de venta.';
    return errores;
  }
}
