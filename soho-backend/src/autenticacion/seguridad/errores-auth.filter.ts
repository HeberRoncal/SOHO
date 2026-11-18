import { Catch, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientInitializationError,
)
export class ErroresAuthFilter implements ExceptionFilter {
  catch(_error: unknown, contexto: ArgumentsHost): void {
    const error = new ServiceUnavailableException(
      'No se pudo completar la operación. Inténtalo nuevamente.',
    );
    contexto
      .switchToHttp()
      .getResponse<Response>()
      .status(503)
      .json(error.getResponse());
  }
}
