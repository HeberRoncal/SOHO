import { Catch, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientInitializationError,
)
export class ErroresAuthFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErroresAuthFilter.name);

  catch(error: unknown, contexto: ArgumentsHost): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(
        `Error conocido de Prisma (${error.code}); se respondió 503.`,
      );
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
      this.logger.error(
        `Error de inicialización de Prisma (${error.errorCode ?? 'sin código'}); se respondió 503.`,
      );
    } else {
      this.logger.error('Error desconocido de Prisma; se respondió 503.');
    }

    const respuestaError = new ServiceUnavailableException(
      'No se pudo completar la operación. Inténtalo nuevamente.',
    );
    contexto
      .switchToHttp()
      .getResponse<Response>()
      .status(503)
      .json(respuestaError.getResponse());
  }
}
