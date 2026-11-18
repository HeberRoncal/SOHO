import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ArchivosProductoService } from '../fotografias/archivos-producto.service.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';
import {
  SELECT_PRODUCTO_ADMIN,
  productoAdmin,
} from '../dto/respuesta-productos.js';
import { BloqueoProductoPublicable } from '../publicacion/bloqueo-producto-publicable.js';
import { RequisitosPublicacion } from '../publicacion/requisitos-publicacion.js';
import { DatosPublicado } from './datos-publicado.js';

const copia = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;

@Injectable()
export class PublicadosProductoService {
  constructor(
    @Inject(ArchivosProductoService)
    private readonly archivos: ArchivosProductoService,
  ) {}

  async actualizar(
    id: string,
    cuerpo: unknown,
    sesion: ContextoAuth,
  ): Promise<Prisma.JsonValue> {
    const datos = DatosPublicado.leer(cuerpo);
    const hash = IdentidadProducto.huella({
      tipo: 'ACTUALIZAR',
      contexto: 'publicado',
      id,
      datos,
    });
    try {
      return await this.archivos.escritura.transaccion(async (tx) => {
        const producto = await this.archivos.bloquearProducto(tx, id);
        await this.archivos.escritura.comprobarSesion(tx, sesion, true);
        const previa = await tx.operacionProducto.findUnique({
          where: { claveSolicitud: datos.claveSolicitud },
        });
        if (previa) {
          if (
            previa.usuarioResponsableId !== sesion.usuario.id ||
            previa.productoId !== id ||
            previa.tipo !== 'ACTUALIZAR' ||
            previa.solicitudHash !== hash
          )
            throw new ConflictException({
              codigo: 'CLAVE_PRODUCTO_EN_USO',
              message: 'La clave de solicitud ya corresponde a otra operación.',
            });
          return previa.respuesta;
        }
        if (producto.estado !== 'PUBLICADO')
          throw new ConflictException({
            codigo: 'ESTADO_PRODUCTO_INCOMPATIBLE',
            message: 'Esta operación solo permite editar productos publicados.',
          });
        if (producto.version !== datos.version)
          throw new ConflictException({
            codigo: 'PRODUCTO_CAMBIADO',
            message:
              'El producto cambió. Vuelve a consultarlo antes de guardar.',
          });
        const categoriaId =
          datos.categoriaId === undefined
            ? producto.categoriaId
            : datos.categoriaId;
        const { producto: actual } = await BloqueoProductoPublicable.bloquear(
          tx,
          producto,
          this.archivos,
          categoriaId,
        );
        const categoria = categoriaId
          ? await tx.categoria.findUnique({ where: { id: categoriaId } })
          : null;
        const cambios = {
          nombre: datos.nombre ?? actual.nombre,
          descripcion: datos.descripcion ?? actual.descripcion,
          categoriaId,
          genero: datos.genero ?? actual.genero,
          precio:
            datos.precio === undefined
              ? actual.precio
              : datos.precio === null
                ? null
                : new Prisma.Decimal(datos.precio),
          precioAnterior:
            datos.precioAnterior === undefined
              ? actual.precioAnterior
              : datos.precioAnterior === null
                ? null
                : new Prisma.Decimal(datos.precioAnterior),
          esNovedad: datos.esNovedad ?? actual.esNovedad,
          ordenCatalogo: datos.ordenCatalogo ?? actual.ordenCatalogo,
          ordenColor: datos.ordenColor ?? actual.ordenColor,
        };
        await this.archivos.escritura.comprobarSesion(tx, sesion, true);
        RequisitosPublicacion.comprobar({ ...actual, ...cambios, categoria });
        const antes = productoAdmin(
          await tx.producto.findUniqueOrThrow({
            where: { id },
            select: SELECT_PRODUCTO_ADMIN,
          }),
        );
        await tx.producto.update({
          where: { id },
          data: {
            ...cambios,
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
            tipo: 'ACTUALIZAR',
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
            tipo: 'ACTUALIZAR',
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
