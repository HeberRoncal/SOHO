import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ArchivosProductoService } from '../fotografias/archivos-producto.service.js';
import { DatosEstadoProducto } from '../dto/datos-estado-producto.js';
import { RequisitosPublicacion } from './requisitos-publicacion.js';
import { BloqueoProductoPublicable } from './bloqueo-producto-publicable.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';
import {
  SELECT_PRODUCTO_ADMIN,
  productoAdmin,
} from '../dto/respuesta-productos.js';

const copia = (valor: unknown) =>
  JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonObject;

@Injectable()
export class PublicacionProductoService {
  constructor(
    @Inject(ArchivosProductoService)
    private readonly archivos: ArchivosProductoService,
  ) {}

  async publicar(
    id: string,
    cuerpo: unknown,
    sesion: ContextoAuth,
  ): Promise<Prisma.JsonValue> {
    const datos = DatosEstadoProducto.leer(cuerpo);
    const hash = IdentidadProducto.huella({ tipo: 'PUBLICAR', id, datos });
    try {
      return await this.archivos.escritura.transaccion(async (tx) => {
        const producto = await this.archivos.bloquearProducto(tx, id);
        await this.archivos.escritura.comprobarSesion(tx, sesion, true);
        const repetida = await tx.operacionProducto.findUnique({
          where: { claveSolicitud: datos.claveSolicitud },
        });
        if (repetida) {
          if (
            repetida.usuarioResponsableId !== sesion.usuario.id ||
            repetida.solicitudHash !== hash ||
            repetida.productoId !== id ||
            repetida.tipo !== 'PUBLICAR'
          )
            throw new ConflictException(
              'La clave de solicitud ya corresponde a otra operación.',
            );
          return repetida.respuesta;
        }
        this.archivos.exigirBorrador(producto, datos.version);
        const conversion = await tx.conversionCatalogo.findUnique({
          where: { id: 1 },
          select: { realizadaEn: true },
        });
        if (!conversion?.realizadaEn)
          throw new ConflictException(
            'Completa la conversión del catálogo antes de publicar productos.',
          );

        const { producto: actual } = await BloqueoProductoPublicable.bloquear(
          tx,
          producto,
          this.archivos,
        );
        await this.archivos.escritura.comprobarSesion(tx, sesion, true);
        RequisitosPublicacion.comprobar(actual);
        const antes = productoAdmin(
          await tx.producto.findUniqueOrThrow({
            where: { id },
            select: SELECT_PRODUCTO_ADMIN,
          }),
        );
        await tx.producto.update({
          where: { id },
          data: {
            estado: 'PUBLICADO',
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
            tipo: 'PUBLICAR',
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
            tipo: 'PUBLICAR',
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
        throw new ConflictException(
          'La clave de solicitud ya está en uso. Consulta su resultado antes de reintentar.',
        );
      throw e;
    }
  }
}
