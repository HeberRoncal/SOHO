import { RolCuenta } from './cuenta';

export interface UsuarioApi {
  id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  rol: RolCuenta;
  correoVerificado: boolean;
}
export interface RespuestaSesion {
  usuario: UsuarioApi;
}
export interface RespuestaAcceso extends RespuestaSesion {
  csrfToken: string;
}
