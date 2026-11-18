import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import {
  SELECT_PRODUCTO_ADMIN,
  productoAdmin,
} from '../dto/respuesta-productos.js';
import {
  DatosBorrador,
  type CambioBorrador,
  type GrupoBorrador,
} from './datos-borrador.js';
import { IdentidadProducto } from './identidad-producto.js';

type Tx = Prisma.TransactionClient;
const INCLUIR_BORRADOR = {
  grupoModelo: { include: { marca: true } },
  colores: {
    include: { _count: { select: { variantes: true, imagenes: true } } },
  },
  variantesDirectas: { include: { talla: true } },
  _count: { select: { archivosOrigen: true, imagenes: true } },
} satisfies Prisma.ProductoInclude;
type Borrador = Prisma.ProductoGetPayload<{ include: typeof INCLUIR_BORRADOR }>;
function conflicto(message: string): never {
  throw new ConflictException(message);
}

@Injectable()
export class BorradoresProductoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
  ) {}

  crear(cuerpo: unknown, sesion: ContextoAuth) {
    const datos = DatosBorrador.leer(cuerpo, false);
    return this.guardar(null, datos, sesion);
  }
  actualizar(id: string, cuerpo: unknown, sesion: ContextoAuth) {
    const datos = DatosBorrador.leer(cuerpo, true);
    return this.guardar(id, datos, sesion);
  }

  async consultarOperacion(clave: string, sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const op = await tx.operacionProducto.findUnique({
        where: { claveSolicitud: clave },
      });
      if (!op || op.usuarioResponsableId !== sesion.usuario.id)
        throw new NotFoundException('Operación no encontrada.');
      return op.respuesta;
    });
  }

  private async conversion(tx: Tx) {
    const control = await tx.conversionCatalogo.findUnique({
      where: { id: 1 },
      select: { realizadaEn: true },
    });
    if (!control?.realizadaEn)
      conflicto(
        'Completa la conversión del catálogo antes de guardar productos.',
      );
  }

  private async repetir(
    tx: Tx,
    clave: string,
    hash: string,
    sesion: ContextoAuth,
  ) {
    const op = await tx.operacionProducto.findUnique({
      where: { claveSolicitud: clave },
    });
    if (!op) return null;
    await this.escritura.comprobarSesion(tx, sesion, true);
    if (
      op.usuarioResponsableId !== sesion.usuario.id ||
      op.solicitudHash !== hash
    )
      conflicto('La clave de solicitud ya corresponde a otra operación.');
    return op.respuesta;
  }

  private async resolverGrupo(
    tx: Tx,
    entrada: GrupoBorrador | null | undefined,
    actual: Borrador | null,
    responsable: string,
  ) {
    if (entrada === null || (entrada === undefined && !actual?.grupoModeloId))
      return null;
    const id =
      entrada && 'id' in entrada
        ? entrada.id
        : entrada === undefined
          ? actual!.grupoModeloId
          : null;
    if (id) {
      await tx.$queryRaw`SELECT id FROM grupos_modelo WHERE id=${id} FOR UPDATE`;
      const g = await tx.grupoModelo.findUnique({
        where: { id },
        include: { marca: true },
      });
      if (!g)
        throw new UnprocessableEntityException('El grupo de modelo no existe.');
      if (entrada && 'id' in entrada && g.version !== entrada.version)
        conflicto('El grupo de modelo cambió. Vuelve a consultarlo.');
      if (!g.marcaId || !g.marca || !g.codigoModelo || !g.modelo)
        throw new UnprocessableEntityException(
          'Completa el grupo de modelo antes de seleccionarlo.',
        );
      await tx.$queryRaw`SELECT id FROM marcas WHERE id=${g.marcaId} FOR UPDATE`;
      // Leer de nuevo después del bloqueo de marca evita usar su código anterior.
      return tx.grupoModelo.findUniqueOrThrow({
        where: { id },
        include: { marca: true },
      });
    }
    if (!entrada || 'id' in entrada)
      throw new BadRequestException('El grupo no es válido.');
    await tx.$queryRaw`SELECT id FROM marcas WHERE id=${entrada.marcaId} FOR UPDATE`;
    const marca = await tx.marca.findUnique({ where: { id: entrada.marcaId } });
    if (!marca) throw new UnprocessableEntityException('La marca no existe.');
    const slugCarpeta =
      entrada.slugCarpeta ??
      IdentidadProducto.slug(marca.slug + '-' + entrada.modelo)
        .slice(0, 160)
        .replace(/-$/, '');
    return tx.grupoModelo.create({
      data: {
        marcaId: marca.id,
        codigoModelo: entrada.codigoModelo,
        modelo: entrada.modelo,
        slugCarpeta,
        creadoPorId: responsable,
        actualizadoPorId: responsable,
      },
      include: { marca: true },
    });
  }

  private async guardar(
    id: string | null,
    datos: CambioBorrador,
    sesion: ContextoAuth,
  ): Promise<Prisma.JsonValue> {
    const hash = IdentidadProducto.huella({
      tipo: id ? 'ACTUALIZAR' : 'CREAR',
      id,
      datos,
    });
    try {
      return await this.escritura.transaccion(async (tx) => {
        await this.conversion(tx);
        let actual: Borrador | null = null;
        let numero: number | null = null;
        if (id) {
          await tx.$queryRaw`SELECT id FROM productos WHERE id=${id} FOR UPDATE`;
          actual = await tx.producto.findUnique({
            where: { id },
            include: INCLUIR_BORRADOR,
          });
        } else {
          await tx.$queryRaw`SELECT id FROM secuencia_codigo_producto WHERE id=1 FOR UPDATE`;
          const secuencia = await tx.secuenciaCodigoProducto.findUnique({
            where: { id: 1 },
          });
          if (!secuencia)
            conflicto('El contador de códigos no está inicializado.');
          numero = secuencia.ultimoNumero + 1;
        }
        const repetida = await this.repetir(
          tx,
          datos.claveSolicitud,
          hash,
          sesion,
        );
        if (repetida) return repetida;
        if (numero !== null && numero > 4294967295)
          conflicto('El contador de códigos alcanzó su límite.');
        if (id && !actual)
          throw new NotFoundException('Producto no encontrado.');
        if (actual && actual.estado !== 'BORRADOR')
          conflicto(
            'Solo se pueden editar borradores mediante esta operación.',
          );
        if (actual && actual.version !== datos.version)
          conflicto(
            'El borrador cambió. Vuelve a consultarlo antes de guardar.',
          );
        if (
          actual &&
          (actual.colores.length > 1 ||
            actual.colores.reduce((n, c) => n + c._count.variantes, 0) !==
              actual.variantesDirectas.length ||
            actual.variantesDirectas.some(
              (v) => v.productoColorId !== actual!.colores[0]?.id,
            ))
        )
          conflicto(
            'Las relaciones del producto necesitan revisión antes de editarlo.',
          );
        const responsable = sesion.usuario.id;
        const grupo = await this.resolverGrupo(
          tx,
          datos.grupoModelo,
          actual,
          responsable,
        );
        const color =
          datos.color === undefined
            ? actual?.codigoColor
              ? {
                  codigo: actual.codigoColor,
                  nombre: actual.colorNombre!,
                  hexadecimal: actual.colorHexadecimal!,
                }
              : null
            : datos.color;
        const identidadUsada =
          actual &&
          (actual.variantesDirectas.length > 0 ||
            actual._count.archivosOrigen > 0 ||
            actual._count.imagenes > 0 ||
            actual.colores.some((c) => c._count.imagenes > 0));
        if (
          actual &&
          identidadUsada &&
          (grupo?.id !== (actual.grupoModeloId ?? undefined) ||
            color?.codigo !== (actual.codigoColor ?? undefined))
        )
          conflicto(
            'El grupo y el código de color son inmutables cuando ya existen variantes o archivos.',
          );
        const categoriaId =
          datos.categoriaId === undefined
            ? (actual?.categoriaId ?? null)
            : datos.categoriaId;
        if (categoriaId) {
          const categoria = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM categorias WHERE id=${categoriaId} FOR UPDATE`;
          if (!categoria.length)
            throw new UnprocessableEntityException('La categoría no existe.');
        }
        const precio =
          datos.precio === undefined
            ? (actual?.precio?.toFixed(2) ?? null)
            : datos.precio;
        const precioAnterior =
          datos.precioAnterior === undefined
            ? (actual?.precioAnterior?.toFixed(2) ?? null)
            : datos.precioAnterior;
        if (
          precioAnterior !== null &&
          (precio === null || new Prisma.Decimal(precioAnterior).lte(precio))
        )
          throw new BadRequestException(
            'El precio anterior debe superar el precio actual.',
          );
        if (
          datos.tallas?.length &&
          (!grupo?.marca || !grupo.codigoModelo || !color)
        )
          throw new UnprocessableEntityException(
            'Selecciona modelo, marca y color antes de añadir tallas.',
          );
        // Validar el código existente de marca incluso si estas tallas ya estaban guardadas.
        if (datos.tallas?.length)
          IdentidadProducto.sku(
            grupo!.marca!.codigo,
            grupo!.codigoModelo!,
            color!.codigo,
            datos.tallas[0],
          );
        await this.escritura.comprobarSesion(tx, sesion, true);
        const antes = actual
          ? productoAdmin(
              await tx.producto.findUniqueOrThrow({
                where: { id: actual.id },
                select: SELECT_PRODUCTO_ADMIN,
              }),
            )
          : null;
        const cambios = {
          nombre: datos.nombre ?? actual!.nombre,
          descripcion: datos.descripcion ?? actual?.descripcion ?? '',
          grupoModeloId: grupo?.id ?? null,
          marcaId: grupo?.marcaId ?? null,
          codigoModelo: grupo?.codigoModelo ?? null,
          modelo: grupo?.modelo ?? null,
          codigoColor: color?.codigo ?? null,
          colorNombre: color?.nombre ?? null,
          colorHexadecimal: color?.hexadecimal ?? null,
          categoriaId,
          genero: datos.genero ?? actual?.genero ?? 'UNISEX',
          precio,
          precioAnterior,
          esNovedad: datos.esNovedad ?? actual?.esNovedad ?? false,
          ordenCatalogo: datos.ordenCatalogo ?? actual?.ordenCatalogo ?? 0,
          ordenColor: datos.ordenColor ?? actual?.ordenColor ?? 0,
          actualizadoPorId: responsable,
        };
        let productoId: string;
        if (actual) {
          await tx.producto.update({
            where: { id: actual.id },
            data: { ...cambios, version: { increment: 1 } },
          });
          productoId = actual.id;
        } else {
          const codigoInterno = 'SHO-' + String(numero).padStart(4, '0');
          const slugBase =
            IdentidadProducto.slug(datos.nombre!)
              .slice(0, 140)
              .replace(/-$/, '') || 'producto';
          const nuevo = await tx.producto.create({
            data: {
              ...cambios,
              id: randomUUID(),
              codigoInterno,
              slug: slugBase + '-' + codigoInterno.toLowerCase(),
              creadoPorId: responsable,
              estado: 'BORRADOR',
            },
          });
          productoId = nuevo.id;
          await tx.secuenciaCodigoProducto.update({
            where: { id: 1 },
            data: { ultimoNumero: numero! },
          });
        }
        let puente = actual?.colores[0];
        if (color) {
          const data = {
            codigo: color.codigo,
            nombre: color.nombre,
            hexadecimal: color.hexadecimal,
            orden: cambios.ordenColor,
          };
          if (puente)
            await tx.productoColor.update({ where: { id: puente.id }, data });
          else
            puente = await tx.productoColor.create({
              data: { ...data, productoId },
              include: {
                _count: { select: { variantes: true, imagenes: true } },
              },
            });
        } else if (puente) {
          await tx.productoColor.delete({ where: { id: puente.id } });
          puente = undefined;
        }
        for (const medida of datos.tallas ?? []) {
          if (actual?.variantesDirectas.some((v) => v.talla.valor.eq(medida)))
            continue;
          const talla = await tx.talla.upsert({
            where: { sistema_valor: { sistema: 'EU', valor: medida } },
            create: {
              sistema: 'EU',
              valor: medida,
              orden: Number(medida) * 2 - 70,
            },
            update: {},
          });
          await tx.variante.create({
            data: {
              productoId,
              productoColorId: puente!.id,
              tallaId: talla.id,
              sku: IdentidadProducto.sku(
                grupo!.marca!.codigo,
                grupo!.codigoModelo!,
                color!.codigo,
                medida,
              ),
              existencias: 0,
              cantidadReservada: 0,
              habilitada: true,
            },
          });
        }
        const despues = productoAdmin(
          await tx.producto.findUniqueOrThrow({
            where: { id: productoId },
            select: SELECT_PRODUCTO_ADMIN,
          }),
        );
        const versionPosterior = actual ? actual.version + 1 : 1;
        const respuesta = JSON.parse(
          JSON.stringify({
            producto: despues,
            operacion: {
              claveSolicitud: datos.claveSolicitud,
              tipo: actual ? 'ACTUALIZAR' : 'CREAR',
              versionAnterior: actual?.version ?? null,
              versionPosterior,
            },
          }),
        ) as Prisma.InputJsonObject;
        await tx.operacionProducto.create({
          data: {
            claveSolicitud: datos.claveSolicitud,
            solicitudHash: hash,
            productoId,
            usuarioResponsableId: responsable,
            tipo: actual ? 'ACTUALIZAR' : 'CREAR',
            versionAnterior: actual?.version ?? null,
            versionPosterior,
            antes: antes
              ? (JSON.parse(JSON.stringify(antes)) as Prisma.InputJsonObject)
              : Prisma.DbNull,
            despues: JSON.parse(
              JSON.stringify(despues),
            ) as Prisma.InputJsonObject,
            respuesta,
          },
        });
        return respuesta as Prisma.JsonObject;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return this.escritura.transaccion(async (tx) => {
          const repetida = await this.repetir(
            tx,
            datos.claveSolicitud,
            hash,
            sesion,
          );
          if (repetida) return repetida;
          await this.escritura.comprobarSesion(tx, sesion, true);
          return conflicto(
            'Ya existe el grupo, el color, la carpeta o una de las identidades solicitadas. Consulta los datos antes de reintentar.',
          );
        });
      }
      throw e;
    }
  }
}
