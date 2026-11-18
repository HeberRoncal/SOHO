import { Facturacion } from './facturacion';

export interface DatosEntrega {
  readonly nombres: string;
  readonly apellidos: string;
  readonly correo: string;
  readonly celular: string;
  readonly distrito: string;
  readonly direccion: string;
  readonly referencia: string;
  readonly destinatario?: string;
  readonly facturacion?: Facturacion;
}
