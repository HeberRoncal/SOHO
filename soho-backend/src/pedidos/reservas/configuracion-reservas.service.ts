import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import type { ActualizarConfiguracionReservasDto } from '../dto/actualizar-configuracion-reservas.dto.js';
import { EscrituraPedidoService } from '../seguridad/escritura-pedido.service.js';

const incluirResponsable = {
  actualizadoPor: { select: { id: true, nombres: true, apellidos: true } },
} as const;
type ConfiguracionConResponsable = Prisma.ConfiguracionReservaGetPayload<{
  include: typeof incluirResponsable;
}>;

@Injectable()
export class ConfiguracionReservasService {
  constructor(
    @Inject(EscrituraPedidoService)
    private readonly escritura: EscrituraPedidoService,
  ) {}

  consultar(sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.sesion(tx, { sesion }, true);
      return this.respuesta(await this.leer(tx));
    });
  }

  actualizar(d: ActualizarConfiguracionReservasDto, sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.sesion(tx, { sesion }, true);
      // Crear pedidos mantiene FOR UPDATE sobre esta misma fila mientras copia la política.
      await tx.$queryRaw`SELECT id FROM configuracion_reserva WHERE id = 1 FOR UPDATE`;
      const p = await this.leer(tx);
      if (p.version !== d.version)
        throw new ConflictException({
          codigo: 'CONFIGURACION_RESERVAS_CAMBIADA',
          message:
            'La configuración cambió. Actualiza y revisa sus valores antes de guardar.',
        });
      const igual =
        p.modo === d.modo &&
        p.horas === d.horas &&
        p.accionVencimiento === d.accionVencimiento &&
        p.accionCancelacion === d.accionCancelacion;
      // Confirmar la misma política conserva versión, responsable y fechas.
      if (igual) return { ...this.respuesta(p), modificada: false };
      if (p.version === 4294967295)
        throw new ConflictException({
          codigo: 'VERSION_RESERVAS_AGOTADA',
          message:
            'La configuración alcanzó su límite de versiones y requiere revisión.',
        });
      const ahora = new Date();
      if (ahora < p.creadoEn || ahora < p.actualizadoEn)
        throw new ConflictException({
          codigo: 'CONFIGURACION_RESERVAS_INCONSISTENTE',
          message:
            'Las fechas de configuración requieren revisión antes de guardar.',
        });
      const actual = await tx.configuracionReserva.update({
        where: { id: 1, version: d.version },
        data: {
          modo: d.modo,
          horas: d.horas,
          accionVencimiento: d.accionVencimiento,
          accionCancelacion: d.accionCancelacion,
          version: { increment: 1 },
          actualizadoPorId: sesion.usuario.id,
          actualizadoEn: ahora,
        },
        include: incluirResponsable,
      });
      return { ...this.respuesta(actual), modificada: true };
    });
  }

  private async leer(tx: Prisma.TransactionClient) {
    const p = await tx.configuracionReserva.findUnique({
      where: { id: 1 },
      include: incluirResponsable,
    });
    if (!p)
      throw new ServiceUnavailableException({
        codigo: 'CONFIGURACION_RESERVAS_NO_DISPONIBLE',
        message:
          'La configuración de reservas no está disponible. No se guardaron cambios.',
      });
    return p;
  }

  private respuesta(p: ConfiguracionConResponsable) {
    return {
      configuracion: {
        version: p.version,
        modo: p.modo,
        horas: p.horas,
        accionVencimiento: p.accionVencimiento,
        accionCancelacion: p.accionCancelacion,
        creadoEn: p.creadoEn.toISOString(),
        actualizadoEn: p.actualizadoEn.toISOString(),
        actualizadoPor: p.actualizadoPor
          ? {
              id: p.actualizadoPor.id,
              nombre: `${p.actualizadoPor.nombres} ${p.actualizadoPor.apellidos}`,
            }
          : null,
      },
      capacidades: { reservaTemporalDisponible: true },
    };
  }
}
