import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type NestMiddleware,
} from '@nestjs/common';
import {
  json,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { CsrfService } from '../../autenticacion/seguridad/csrf.service.js';
import { LimitesAuthService } from '../../autenticacion/seguridad/limites-auth.service.js';

export function cuerpoJsonGeneral(): RequestHandler {
  const pequeno = json({ limit: '16kb', strict: true, inflate: false });
  const tienda = json({ limit: '256kb', strict: true, inflate: false });
  return (req, res, next) => {
    if (
      /^\/api\/(?:admin\/configuracion\/tienda(?:\/|$)|admin\/recepciones(?:\/|$)|pagos\/(?:instrucciones|recepciones)(?:\/|$)|configuracion\/pagos\/?$)/i.test(
        req.path,
      )
    ) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
    if (
      req.method === 'PATCH' &&
      /^\/api\/admin\/configuracion\/tienda\/?$/i.test(req.path)
    ) {
      tienda(req, res, next);
      return;
    }
    if (
      req.method === 'POST' &&
      /^\/api\/(?:pedidos(?:\/SOHO-[A-Z0-9]{6,24}\/comprobantes)?|pagos\/recepciones(?:\/[0-9a-f-]{36}\/comprobantes)?)\/?$/i.test(
        req.path,
      )
    )
      next();
    else pequeno(req, res, next);
  };
}

@Injectable()
export class CuerpoPedidoMiddleware implements NestMiddleware {
  private readonly leer = json({ limit: '8mb', strict: true, inflate: false });

  constructor(
    @Inject(CsrfService) private readonly csrf: CsrfService,
    @Inject(LimitesAuthService) private readonly limites: LimitesAuthService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Cache-Control', 'no-store');
    // Autorización del origen y límite antes de cargar un cuerpo grande en memoria.
    this.csrf.validar(req);
    this.limites.comprobar('crear-pedido', req, res);
    this.leer(req, res, (error?: { type?: string; status?: number }) => {
      if (!error) return next();
      if (error.status === 413)
        return next(
          new PayloadTooLargeException('El cuerpo del pedido supera 8 MiB.'),
        );
      if (error.status === 415)
        return next(
          new UnsupportedMediaTypeException('Envía JSON UTF-8 sin compresión.'),
        );
      next(new BadRequestException('El JSON del pedido no es válido.'));
    });
  }
}
