export type PropositoGoogle = 'acceso' | 'vinculacion';
export interface ConfiguracionGoogle {
  habilitado: boolean;
  clientId: string | null;
}
export interface DesafioGoogle {
  clientId: string;
  nonce: string;
  expiraEn: string;
}
export interface PerfilGoogle {
  nombres: string;
  apellidos: string;
}
export type ResultadoGoogle =
  | { tipo: 'correcto' }
  | { tipo: 'completar'; perfil: PerfilGoogle & { correo: string } }
  | { tipo: 'error'; mensaje: string };

export interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    ux_mode: 'popup';
    callback: (respuesta: { credential: string; state?: string }) => void;
  }): void;
  renderButton(
    elemento: HTMLElement,
    config: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: 'continue_with';
      shape: 'rectangular';
      locale: 'es';
      width: number;
      state: string;
    },
  ): void;
}
