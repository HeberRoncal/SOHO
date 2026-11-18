import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, RolUsuario } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClavesService } from '../seguridad/claves.service.js';
import { seleccionUsuario, usuarioPublico } from '../sesiones/contexto-auth.js';
import { nombre } from '../acceso/datos-auth.js';
import { SesionesService } from '../sesiones/sesiones.service.js';
import type { PerfilGoogle } from './datos-google.js';
import type { IdentidadGoogleVerificada } from './verificador-google.service.js';

@Injectable()
export class GoogleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(ClavesService) private readonly claves: ClavesService,
  ) {}

  async acceder(
    google: IdentidadGoogleVerificada,
    perfil?: PerfilGoogle,
    anterior?: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const identidad = await tx.identidadExterna.findUnique({
          where: {
            proveedor_identificadorProveedor: {
              proveedor: 'GOOGLE',
              identificadorProveedor: google.sub,
            },
          },
          select: {
            usuario: { select: { ...seleccionUsuario, activo: true } },
          },
        });
        let usuario = identidad?.usuario;
        if (usuario && !usuario.activo)
          throw new ForbiddenException('No se pudo acceder con esta cuenta.');
        if (!usuario) {
          if (!google.correoConfiable)
            throw new ForbiddenException({
              codigo: 'GOOGLE_CORREO_NO_VERIFICABLE',
              message:
                'Crea una cuenta con contraseña y vincula Google desde Mis datos.',
            });
          if (
            await tx.usuario.findUnique({
              where: { correo: google.correo },
              select: { id: true },
            })
          ) {
            throw new ConflictException({
              codigo: 'GOOGLE_VINCULACION_REQUERIDA',
              message:
                'Inicia sesión en tu cuenta y vincula Google desde Mis datos.',
            });
          }
          let datos = perfil;
          if (!datos) {
            try {
              datos = {
                nombres: nombre(google.nombres),
                apellidos: nombre(google.apellidos),
              };
            } catch {
              const sugerencia = (valor?: string) => {
                try {
                  return nombre(valor);
                } catch {
                  return '';
                }
              };
              throw new UnprocessableEntityException({
                codigo: 'GOOGLE_COMPLETAR_PERFIL',
                message: 'Completa tus nombres y apellidos.',
                perfil: {
                  nombres: sugerencia(google.nombres),
                  apellidos: sugerencia(google.apellidos),
                  correo: google.correo,
                },
              });
            }
          }
          usuario = await tx.usuario.create({
            data: {
              ...datos,
              correo: google.correo,
              claveHash: null,
              rol: RolUsuario.CLIENTE,
              correoVerificadoEn: new Date(),
              identidadesExternas: {
                create: {
                  proveedor: 'GOOGLE',
                  identificadorProveedor: google.sub,
                },
              },
            },
            select: { ...seleccionUsuario, activo: true },
          });
        }
        const sesion = await this.sesiones.crear(tx, usuario.id, anterior);
        return { usuario: usuarioPublico(usuario), ...sesion };
      });
    } catch (error) {
      this.conflictoConcurrente(error);
    }
  }

  async estado(usuarioId: string) {
    return {
      vinculado:
        (await this.prisma.identidadExterna.count({
          where: { usuarioId, proveedor: 'GOOGLE' },
        })) > 0,
    };
  }

  async vincular(
    google: IdentidadGoogleVerificada,
    usuarioId: string,
    clave: string,
    anterior?: string,
  ) {
    const cuenta = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { claveHash: true, activo: true },
    });
    const correcta = await this.claves.verificar(cuenta?.claveHash, clave);
    if (!correcta || !cuenta?.activo)
      throw new ForbiddenException({
        codigo: 'GOOGLE_REAUTENTICACION_REQUERIDA',
        message: 'Confirma la contraseña actual de tu cuenta.',
      });
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serializa las vinculaciones del mismo usuario, incluso entre pestañas.
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM usuarios WHERE id = ${usuarioId} FOR UPDATE`,
        );
        let usuario = await tx.usuario.findUnique({
          where: { id: usuarioId },
          select: { ...seleccionUsuario, activo: true, claveHash: true },
        });
        if (!usuario?.activo || usuario.claveHash !== cuenta.claveHash)
          throw new ForbiddenException('Vuelve a autenticar tu cuenta.');
        const identidad = await tx.identidadExterna.findUnique({
          where: {
            proveedor_identificadorProveedor: {
              proveedor: 'GOOGLE',
              identificadorProveedor: google.sub,
            },
          },
        });
        if (identidad && identidad.usuarioId !== usuarioId)
          throw new ConflictException({
            codigo: 'GOOGLE_IDENTIDAD_OCUPADA',
            message:
              'Esta cuenta de Google ya está vinculada a otra cuenta de SOHO.',
          });
        if (!identidad) {
          if (
            await tx.identidadExterna.count({
              where: { usuarioId, proveedor: 'GOOGLE' },
            })
          )
            throw new ConflictException({
              codigo: 'GOOGLE_YA_VINCULADO',
              message: 'Tu cuenta ya tiene Google vinculado.',
            });
          await tx.identidadExterna.create({
            data: {
              usuarioId,
              proveedor: 'GOOGLE',
              identificadorProveedor: google.sub,
            },
          });
        }
        if (
          !usuario.correoVerificadoEn &&
          google.correoConfiable &&
          usuario.correo === google.correo
        ) {
          usuario = await tx.usuario.update({
            where: { id: usuarioId },
            data: { correoVerificadoEn: new Date() },
            select: { ...seleccionUsuario, activo: true, claveHash: true },
          });
        }
        const sesion = await this.sesiones.crear(tx, usuarioId, anterior);
        return { usuario: usuarioPublico(usuario), ...sesion };
      });
    } catch (error) {
      this.conflictoConcurrente(error);
    }
  }

  private conflictoConcurrente(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        codigo: 'GOOGLE_CONFLICTO_CUENTA',
        message: 'La cuenta cambió durante el acceso. Vuelve a intentarlo.',
      });
    }
    throw error;
  }
}
