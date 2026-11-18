import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ArchivosProductoService } from '../fotografias/archivos-producto.service.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';
import { DatosEstadoProducto } from '../dto/datos-estado-producto.js';
import {
  SELECT_PRODUCTO_ADMIN,
  productoAdmin,
} from '../dto/respuesta-productos.js';

const copia = (valor: unknown) =>
  JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonObject;

@Injectable()
export class ArchivoProductoService {
  constructor(
    @Inject(ArchivosProductoService)
    private readonly archivos: ArchivosProductoService,
  ) {}

  archivar(id: string, cuerpo: unknown, sesion: ContextoAuth) {
    return this.cambiar(id, cuerpo, sesion, 'ARCHIVAR');
  }

  restaurar(id: string, cuerpo: unknown, sesion: ContextoAuth) {
    return this.cambiar(id, cuerpo, sesion, 'RESTAURAR');
  }

  private async cambiar(
    id: string,
    cuerpo: unknown,
    sesion: ContextoAuth,
    tipo: 'ARCHIVAR' | 'RESTAURAR',
  ): Promise<Prisma.JsonValue> {
    const datos = DatosEstadoProducto.leer(cuerpo);
    const hash = IdentidadProducto.huella({ tipo, id, datos });
    try {
      return await this.archivos.escritura.transaccion(async (tx) => {
        const producto = await this.archivos.bloquearProducto(tx, id);
        // La autorización se relee después de esperar el bloqueo comercial.
        await this.archivos.escritura.comprobarSesion(tx, sesion, true);
        const repetida = await tx.operacionProducto.findUnique({
          where: { claveSolicitud: datos.claveSolicitud },
        });
        if (repetida) {
          if (
            repetida.usuarioResponsableId !== sesion.usuario.id ||
            repetida.solicitudHash !== hash ||
            repetida.productoId !== id ||
            repetida.tipo !== tipo
          )
            throw new ConflictException({
              codigo: 'CLAVE_PRODUCTO_EN_USO',
              message: 'La clave de solicitud ya corresponde a otra operación.',
            });
          return repetida.respuesta;
        }
        const admite =
          tipo === 'ARCHIVAR'
            ? producto.estado === 'BORRADOR' || producto.estado === 'PUBLICADO'
            : producto.estado === 'ARCHIVADO';
        if (!admite)
          throw new ConflictException({
            codigo: 'ESTADO_PRODUCTO_INCOMPATIBLE',
            message:
              tipo === 'ARCHIVAR'
                ? 'Solo se pueden archivar borradores o productos publicados.'
                : 'Solo se pueden restaurar productos archivados.',
          });
        if (producto.version !== datos.version)
          throw new ConflictException({
            codigo: 'PRODUCTO_CAMBIADO',
            message:
              'El producto cambió. Vuelve a consultarlo antes de confirmar.',
          });
        const antes = productoAdmin(
          await tx.producto.findUniqueOrThrow({
            where: { id },
            select: SELECT_PRODUCTO_ADMIN,
          }),
        );
        // No se escriben variantes, reservas, pedidos ni recursos externos.
        await tx.producto.update({
          where: { id },
          data: {
            estado: tipo === 'ARCHIVAR' ? 'ARCHIVADO' : 'BORRADOR',
            version: { increment: 1 },
            actualizadoPorId: sesion.usuario.id,
          },
        });
        const despues = productoAdmin(
          await tx.producto.findUniqueOrThrow({
            where: { id },
            select: SELECT_PRODUCTO_ADMIN,
          }),
        );
        const respuesta = copia({
          producto: despues,
          operacion: {
            claveSolicitud: datos.claveSolicitud,
            tipo,
            versionAnterior: producto.version,
            versionPosterior: producto.version + 1,
          },
        });
        await tx.operacionProducto.create({
          data: {
            claveSolicitud: datos.claveSolicitud,
            solicitudHash: hash,
            productoId: id,
            usuarioResponsableId: sesion.usuario.id,
            tipo,
            versionAnterior: producto.version,
            versionPosterior: producto.version + 1,
            antes: copia(antes),
            despues: copia(despues),
            respuesta,
          },
        });
        return respuesta as Prisma.JsonObject;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException({
          codigo: 'CLAVE_PRODUCTO_EN_USO',
          message:
            'La clave de solicitud ya está en uso. Consulta su resultado antes de reintentar.',
        });
      throw e;
    }
  }
}
