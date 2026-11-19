import { Catch, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientInitializationError,
)
export class ErrorClientesFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorClientesFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const detalle = error as {
      name?: unknown;
      code?: unknown;
      errorCode?: unknown;
      clientVersion?: unknown;
      meta?: unknown;
    };
    const meta =
      detalle.meta && typeof detalle.meta === 'object'
        ? (detalle.meta as Record<string, unknown>)
        : {};
    const seguro = (valor: unknown): string | number | undefined =>
      (typeof valor === 'string' && valor.length <= 80) ||
      typeof valor === 'number'
        ? valor
        : undefined;
    const codigosMotor: Record<string, string | number> = {};
    const mensajesMotor: string[] = [];
    const leerCodigosMotor = (valor: unknown, nivel = 0): void => {
      if (!valor || typeof valor !== 'object' || nivel > 4) return;
      const datos = valor as Record<string, unknown>;
      for (const campo of ['message', 'originalMessage', 'reason']) {
        if (typeof datos[campo] === 'string') {
          mensajesMotor.push(datos[campo] as string);
        }
      }
      for (const campo of [
        'code',
        'errno',
        'sqlState',
        'sqlstate',
        'errorCode',
        'originalCode',
        'kind',
      ]) {
        const codigo = seguro(datos[campo]);
        if (codigo !== undefined) codigosMotor[campo] ??= codigo;
      }
      for (const campo of [
        'cause',
        'driverAdapterError',
        'originalError',
        'error',
      ]) {
        leerCodigosMotor(datos[campo], nivel + 1);
      }
    };
    leerCodigosMotor(meta);
    leerCodigosMotor(error);
    const textoErrorMotor = mensajesMotor.join(' ');
    const categoriaMotor =
      /unknown collation/i.test(textoErrorMotor)
        ? 'colacion_no_reconocida'
        : /illegal mix of collations/i.test(textoErrorMotor)
          ? 'mezcla_de_colaciones'
          : /syntax|parse error/i.test(textoErrorMotor)
            ? 'sintaxis_sql'
            : /not supported|unsupported/i.test(textoErrorMotor)
              ? 'funcion_o_sintaxis_no_compatible'
              : /unknown column|no such column/i.test(textoErrorMotor)
                ? 'columna_no_reconocida'
                : /does not exist|doesn't exist|not found/i.test(
                      textoErrorMotor,
                    )
                  ? 'tabla_o_objeto_no_encontrado'
                  : undefined;

    // No registrar mensajes, SQL, parámetros ni metadatos arbitrarios: pueden
    // contener datos del cliente. Estos códigos bastan para diagnosticar Prisma
    // y errores del motor desde los logs de Render.
    this.logger.error(
      `Fallo de persistencia en Clientes ${JSON.stringify({
        tipo: seguro(detalle.name),
        codigoPrisma: seguro(detalle.code),
        codigoInicializacion: seguro(detalle.errorCode),
        codigoMotor: seguro(meta.code) ?? seguro(meta.errno),
        estadoSql: seguro(meta.sqlState) ?? seguro(meta.sqlstate),
        diagnosticoMotor: codigosMotor,
        categoriaMotor,
        versionPrisma: seguro(detalle.clientVersion),
      })}`,
    );

    const respuestaError = new ServiceUnavailableException(
      'No se pudo consultar los clientes. Inténtalo nuevamente.',
    );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(503)
      .json(respuestaError.getResponse());
  }
}
