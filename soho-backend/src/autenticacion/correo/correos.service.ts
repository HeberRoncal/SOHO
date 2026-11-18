import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { domainToASCII } from 'node:url';
import { FORMATO_TOKEN_VERIFICACION } from '../verificacion/datos-verificacion.js';
import {
  CONFIGURACION_CORREO,
  type ConfiguracionCorreo,
  direccionCorreo,
} from './configuracion-correo.js';

const errorEnvio = () =>
  new ServiceUnavailableException(
    'El envío de recuperación no está disponible. Inténtalo nuevamente más tarde.',
  );

@Injectable()
export class CorreosService implements OnApplicationShutdown {
  private readonly transporte?: Transporter<SMTPTransport.SentMessageInfo>;

  constructor(
    @Inject(CONFIGURACION_CORREO) private readonly config: ConfiguracionCorreo,
  ) {
    const smtp = config.smtp;
    if (!config.habilitado || !smtp) return;
    this.transporte = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.puerto,
      secure: smtp.seguro,
      requireTLS: !smtp.seguro && !smtp.inseguroLocal,
      ignoreTLS: smtp.inseguroLocal,
      ...(smtp.usuario && smtp.clave
        ? { auth: { user: smtp.usuario, pass: smtp.clave } }
        : {}),
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      dnsTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  habilitado(): boolean {
    return !!this.transporte;
  }

  async enviar(correo: string, enlace: string): Promise<void> {
    return this.enviarMensaje(correo, enlace, false);
  }
  async enviarVerificacion(correo: string, enlace: string): Promise<void> {
    return this.enviarMensaje(correo, enlace, true);
  }
  private async enviarMensaje(
    correo: string,
    enlace: string,
    verificacion: boolean,
  ): Promise<void> {
    if (!this.transporte || !this.config.smtp || !direccionCorreo(correo))
      throw errorEnvio();
    try {
      const url = new URL(enlace);
      if (
        url.origin !== this.config.origenTienda ||
        url.pathname !==
          (verificacion ? '/verificar-correo' : '/restablecer-contrasena') ||
        url.search ||
        (verificacion
          ? !url.hash.startsWith('#token=') ||
            !FORMATO_TOKEN_VERIFICACION.test(url.hash.slice(7))
          : !/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash))
      )
        throw new Error();
      const mensaje = await this.transporte.sendMail({
        from: { name: 'SOHO', address: this.config.smtp.remitente },
        to: { name: '', address: correo },
        subject: verificacion
          ? 'Verifica tu correo en SOHO'
          : 'Recupera tu contraseña de SOHO',
        text: (verificacion
          ? [
              'Verifica tu correo en SOHO',
              '',
              'Confirma que este correo te pertenece para completar la verificación de tu cuenta.',
              'Abre el enlace y pulsa Verificar mi correo:',
              '',
              enlace,
              '',
              'El enlace vence en 8 horas y solo puede utilizarse una vez.',
              'Si no creaste una cuenta en SOHO, puedes ignorar este mensaje.',
              '',
              'SOHO · Zapatillas multimarca',
            ]
          : [
              'Recupera tu contraseña de SOHO',
              '',
              'Recibimos una solicitud para cambiar la contraseña de tu cuenta.',
              'Abre este enlace para elegir una nueva contraseña:',
              '',
              enlace,
              '',
              'El enlace vence en 30 minutos y solo puede utilizarse una vez.',
              'Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña seguirá igual.',
              '',
              'SOHO · Zapatillas multimarca',
            ]
        ).join('\n'),
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const arroba = correo.lastIndexOf('@');
      const destinatario =
        `${correo.slice(0, arroba)}@${domainToASCII(correo.slice(arroba + 1))}`.toLowerCase();
      const aceptado = mensaje.accepted?.some(
        (destino) => destino.toLowerCase() === destinatario,
      );
      if (!aceptado) throw new Error();
    } catch {
      // No se publica el error SMTP: puede contener credenciales, destinatarios o el enlace.
      throw errorEnvio();
    }
  }

  onApplicationShutdown(): void {
    this.transporte?.close();
  }
}
