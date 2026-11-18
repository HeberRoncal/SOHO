import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, type ZonaEntrega } from '../generated/prisma/client.js';
import type { ActualizarCoberturaDto } from './dto/actualizar-cobertura.dto.js';

function zonaPublica(zona: ZonaEntrega) {
  return {
    codigo: zona.codigo,
    nombre: zona.nombre,
    tarifa: zona.tarifa?.toFixed(2) ?? null,
    plazo: zona.plazo,
    habilitada: zona.habilitada,
    orden: zona.orden,
    cotizable: zona.habilitada && zona.tarifa !== null,
  };
}

function respuestaAdministrativa(zonas: ZonaEntrega[]) {
  const publicas = zonas.map(zonaPublica);
  const version = createHash('sha256')
    .update(
      JSON.stringify(
        zonas.map((z, i) => ({
          ...publicas[i],
          actualizadoEn: z.actualizadoEn.toISOString(),
        })),
      ),
    )
    .digest('hex');
  return { zonas: publicas, version };
}

const orden = [
  { orden: 'asc' },
  { codigo: 'asc' },
] satisfies Prisma.ZonaEntregaOrderByWithRelationInput[];

@Injectable()
export class CoberturaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listar() {
    return {
      zonas: (await this.prisma.zonaEntrega.findMany({ orderBy: orden })).map(
        zonaPublica,
      ),
    };
  }

  async consultarAdministracion() {
    return respuestaAdministrativa(
      await this.prisma.zonaEntrega.findMany({ orderBy: orden }),
    );
  }

  async cotizar(codigo: string) {
    const zona = await this.prisma.zonaEntrega.findUnique({
      where: { codigo },
    });
    if (!zona)
      throw new NotFoundException(
        'No encontramos ese distrito en la cobertura de entrega.',
      );
    if (!zona.habilitada)
      throw new UnprocessableEntityException({
        codigo: 'COBERTURA_DESHABILITADA',
        message: 'La entrega a este distrito no está habilitada.',
      });
    if (zona.tarifa === null)
      throw new UnprocessableEntityException({
        codigo: 'COBERTURA_TARIFA_PENDIENTE',
        message:
          'La tarifa de este distrito todavía está pendiente de definir.',
      });
    return {
      cotizacion: {
        distrito: zona.codigo,
        nombreDistrito: zona.nombre,
        costo: zona.tarifa.toFixed(2),
        plazo: zona.plazo,
        moneda: 'PEN',
      },
    };
  }

  async actualizar(datos: ActualizarCoberturaDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM zonas_entrega ORDER BY codigo FOR UPDATE`;
          const actuales = await tx.zonaEntrega.findMany({ orderBy: orden });
          if (respuestaAdministrativa(actuales).version !== datos.version)
            throw new ConflictException(
              'La cobertura cambió desde que la cargaste. Actualiza la configuración antes de guardar.',
            );
          const codigos = new Set(actuales.map((z) => z.codigo));
          if (
            actuales.length !== datos.zonas.length ||
            datos.zonas.some((z) => !codigos.has(z.codigo))
          )
            throw new BadRequestException(
              'Conserva los siete distritos de cobertura existentes.',
            );
          for (const cambio of datos.zonas) {
            const actual = actuales.find((z) => z.codigo === cambio.codigo)!;
            if (
              actual.habilitada &&
              ((actual.tarifa?.toFixed(2) ?? null) !== cambio.tarifa ||
                actual.plazo !== cambio.plazo)
            )
              throw new ConflictException(
                'Deshabilita primero la zona para cambiar su tarifa o tiempo estimado.',
              );
          }
          for (const cambio of datos.zonas) {
            const actual = actuales.find((z) => z.codigo === cambio.codigo)!;
            if (
              (actual.tarifa?.toFixed(2) ?? null) === cambio.tarifa &&
              actual.plazo === cambio.plazo &&
              actual.habilitada === cambio.habilitada
            )
              continue;
            await tx.zonaEntrega.update({
              where: { codigo: cambio.codigo },
              data: {
                tarifa: cambio.tarifa,
                plazo: cambio.plazo,
                habilitada: cambio.habilitada,
              },
            });
          }
          return respuestaAdministrativa(
            await tx.zonaEntrega.findMany({ orderBy: orden }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException(
          'La cobertura cambió durante la operación. Actualízala antes de reintentar.',
        );
      throw error;
    }
  }
}
