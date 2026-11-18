import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import nodemailer from 'nodemailer';
import {
  crearConfiguracionCorreo,
  direccionCorreo,
} from './configuracion-correo.js';
import { CorreosService } from './correos.service.js';

const origenes = new Set(['http://localhost:4200', 'https://soho.test']);
const remoto = {
  SMTP_HOST: 'smtp.proveedor.test',
  SMTP_USUARIO: 'usuario-sintetico',
  SMTP_CLAVE: 'credencial-sintetica',
  SMTP_REMITENTE: 'cuentas@soho.test',
};

describe('Configuración del envío de recuperación', () => {
  it('permanece deshabilitado sin SMTP y no acepta una configuración parcial', () => {
    expect(crearConfiguracionCorreo({})).toMatchObject({
      habilitado: false,
      origenTienda: 'http://localhost:4200',
    });
    expect(
      crearConfiguracionCorreo({ RECUPERACION_ORIGEN: 'https://soho.test' }),
    ).toMatchObject({ habilitado: false });
    expect(() =>
      crearConfiguracionCorreo({ SMTP_HOST: 'smtp.proveedor.test' }, origenes),
    ).toThrow();
  });
  it('configura STARTTLS por defecto o TLS implícito con puerto 465', () => {
    expect(crearConfiguracionCorreo(remoto, origenes).smtp).toMatchObject({
      puerto: 587,
      seguro: false,
      inseguroLocal: false,
    });
    expect(
      crearConfiguracionCorreo({ ...remoto, SMTP_SECURE: 'true' }, origenes)
        .smtp,
    ).toMatchObject({ puerto: 465, seguro: true });
    expect(() =>
      crearConfiguracionCorreo({ ...remoto, SMTP_PORT: '465' }, origenes),
    ).toThrow();
  });
  it.each([
    { RECUPERACION_ORIGEN: 'https://ajeno.test' },
    { RECUPERACION_ORIGEN: 'http://localhost:4200/' },
    { RECUPERACION_ORIGEN: 'http://localhost:4200/otra' },
    { SMTP_PORT: '65536' },
    { SMTP_PORT: '587.5' },
    { SMTP_SECURE: 'sí' },
    { SMTP_HOST: 'smtp://proveedor.test' },
    { SMTP_USUARIO: undefined },
    { SMTP_CLAVE: undefined },
    { SMTP_REMITENTE: 'uno@soho.test,dos@soho.test' },
    { SMTP_REMITENTE: 'SOHO <cuentas@soho.test>' },
    { SMTP_REMITENTE: 'cuentas@soho.test\r\nBcc:otro@soho.test' },
    { SMTP_PERMITIR_INSEGURO_LOCAL: 'true' },
  ])('rechaza valores ambiguos o inseguros: %j', (extra) => {
    expect(() =>
      crearConfiguracionCorreo({ ...remoto, ...extra }, origenes),
    ).toThrow();
  });
  it('exige un origen HTTPS explícito en producción y rechaza SMTP local sin TLS', () => {
    expect(() =>
      crearConfiguracionCorreo({ ...remoto, NODE_ENV: 'production' }, origenes),
    ).toThrow();
    expect(() =>
      crearConfiguracionCorreo(
        {
          ...remoto,
          NODE_ENV: 'production',
          RECUPERACION_ORIGEN: 'http://localhost:4200',
        },
        origenes,
      ),
    ).toThrow();
    expect(
      crearConfiguracionCorreo(
        {
          ...remoto,
          NODE_ENV: 'production',
          RECUPERACION_ORIGEN: 'https://soho.test',
        },
        origenes,
      ).habilitado,
    ).toBe(true);
    expect(() =>
      crearConfiguracionCorreo(
        {
          ...remoto,
          NODE_ENV: 'production',
          RECUPERACION_ORIGEN: 'https://soho.test',
          SMTP_HOST: '127.0.0.1',
          SMTP_PERMITIR_INSEGURO_LOCAL: 'true',
        },
        origenes,
      ),
    ).toThrow();
  });
  it('solo permite una dirección de destinatario sin cabeceras ni listas', () => {
    expect(direccionCorreo('cliente@soho.test')).toBe(true);
    expect(direccionCorreo('a@soho.test,b@soho.test')).toBe(false);
    expect(direccionCorreo('cliente@soho.test\nBcc:otro@soho.test')).toBe(
      false,
    );
  });
});

describe.sequential('Correos reales contra SMTP local de pruebas', () => {
  let servidor: Server;
  let puerto: number;
  const sockets = new Set<Socket>();
  const mensajes: string[] = [];
  let rechazar = false;
  const token = 'a'.repeat(43);
  const enlace = `http://localhost:4200/restablecer-contrasena#token=${token}`;
  const crearServicio = () =>
    new CorreosService(
      crearConfiguracionCorreo(
        {
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: String(puerto),
          SMTP_REMITENTE: 'cuentas@soho.test',
          SMTP_PERMITIR_INSEGURO_LOCAL: 'true',
        },
        origenes,
      ),
    );
  beforeAll(async () => {
    servidor = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.setEncoding('utf8');
      socket.write('220 SMTP de pruebas\r\n');
      let buffer = '';
      let datos = false;
      let contenido: string[] = [];
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let fin: number;
        while ((fin = buffer.indexOf('\r\n')) !== -1) {
          const linea = buffer.slice(0, fin);
          buffer = buffer.slice(fin + 2);
          if (datos) {
            if (linea === '.') {
              mensajes.push(contenido.join('\r\n'));
              contenido = [];
              datos = false;
              socket.write('250 Mensaje aceptado\r\n');
            } else contenido.push(linea);
          } else if (/^EHLO|^HELO/.test(linea))
            socket.write('250-localhost\r\n250 SIZE 65536\r\n');
          else if (linea.startsWith('MAIL FROM')) socket.write('250 OK\r\n');
          else if (linea.startsWith('RCPT TO'))
            socket.write(
              rechazar ? '550 Usuario privado inexistente\r\n' : '250 OK\r\n',
            );
          else if (linea === 'DATA') {
            datos = true;
            socket.write('354 Enviar mensaje\r\n');
          } else if (linea === 'QUIT') {
            socket.end('221 Cerrado\r\n');
          } else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      servidor.once('error', reject);
      servidor.listen(0, '127.0.0.1', resolve);
    });
    const direccion = servidor.address();
    if (!direccion || typeof direccion === 'string')
      throw new Error('Puerto SMTP temporal no disponible.');
    puerto = direccion.port;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });
  afterEach(() => {
    rechazar = false;
    vi.restoreAllMocks();
  });
  it('envía un mensaje SMTP con remitente, destinatario único y enlace temporal', async () => {
    const servicio = crearServicio();
    try {
      expect(servicio.habilitado()).toBe(true);
      await servicio.enviar('cliente@soho.test', enlace);
      const mensaje = mensajes.at(-1)!;
      expect(mensaje).toContain('From: SOHO <cuentas@soho.test>');
      expect(mensaje).toContain('To: cliente@soho.test');
      // El cuerpo puede usar quoted-printable para conservar Unicode.
      const texto = mensaje
        .replace(/=\r\n/g, '')
        .replace(/=([0-9A-F]{2})/g, (_original, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
      expect(texto).toContain(enlace);
      expect(texto).toContain('30 minutos');
      expect(mensaje).not.toContain('Bcc:');
    } finally {
      servicio.onApplicationShutdown();
    }
  });
  it('envía verificación por el mismo SMTP con propósito y caducidad propios', async () => {
    const servicio = crearServicio();
    const tokenVerificacion =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.' + 'b'.repeat(43);
    const enlaceVerificacion = `http://localhost:4200/verificar-correo#token=${tokenVerificacion}`;
    try {
      await servicio.enviarVerificacion(
        'cliente@soho.test',
        enlaceVerificacion,
      );
      const texto = mensajes.at(-1)!.replace(/=\r\n/g, '').replace(/=3D/g, '=');
      expect(texto).toContain(enlaceVerificacion);
      expect(texto).toContain('8 horas');
      await expect(
        servicio.enviar('cliente@soho.test', enlaceVerificacion),
      ).rejects.toMatchObject({ status: 503 });
      await expect(
        servicio.enviarVerificacion('cliente@soho.test', enlace),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      servicio.onApplicationShutdown();
    }
  });
  it('no revela el error del proveedor y rechaza enlaces de otro origen o destinatarios múltiples', async () => {
    const servicio = crearServicio();
    try {
      rechazar = true;
      await expect(
        servicio.enviar('cliente@soho.test', enlace),
      ).rejects.toMatchObject({
        status: 503,
        message: expect.not.stringContaining('Usuario privado'),
      });
      rechazar = false;
      const antes = mensajes.length;
      await expect(
        servicio.enviar(
          'cliente@soho.test',
          enlace.replace('localhost:4200', 'ajeno.test'),
        ),
      ).rejects.toMatchObject({ status: 503 });
      await expect(
        servicio.enviar('uno@soho.test,dos@soho.test', enlace),
      ).rejects.toMatchObject({ status: 503 });
      expect(mensajes).toHaveLength(antes);
    } finally {
      servicio.onApplicationShutdown();
    }
  });
  it('reconoce el dominio internacional convertido a ASCII por SMTP', async () => {
    const servicio = crearServicio();
    try {
      await expect(
        servicio.enviar('cliente@café.test', enlace),
      ).resolves.toBeUndefined();
      expect(mensajes.at(-1)).toContain('cliente@xn--caf-dma.test');
    } finally {
      servicio.onApplicationShutdown();
    }
  });
  it('configura TLS, tiempos de espera y restricciones sin registrar datos SMTP', () => {
    const crear = vi.spyOn(nodemailer, 'createTransport');
    const servicio = new CorreosService(
      crearConfiguracionCorreo(remoto, origenes),
    );
    try {
      expect(crear).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: false,
          requireTLS: true,
          ignoreTLS: false,
          tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,
          dnsTimeout: 10000,
          logger: false,
          debug: false,
          disableFileAccess: true,
          disableUrlAccess: true,
        }),
      );
    } finally {
      servicio.onApplicationShutdown();
    }
  });
  it('no finge un envío cuando SMTP no está configurado', async () => {
    const servicio = new CorreosService(crearConfiguracionCorreo({}));
    expect(servicio.habilitado()).toBe(false);
    await expect(
      servicio.enviar('cliente@soho.test', enlace),
    ).rejects.toMatchObject({ status: 503 });
  });
});
