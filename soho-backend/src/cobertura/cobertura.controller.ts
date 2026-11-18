import { Controller, Get, Header, Inject, Param } from '@nestjs/common';
import { Publico } from '../autenticacion/seguridad/auth.decoradores.js';
import { CoberturaService } from './cobertura.service.js';
import { CodigoZonaPipe } from './pipes/codigo-zona.pipe.js';

@Controller('api/cobertura')
export class CoberturaController {
  constructor(
    @Inject(CoberturaService) private readonly cobertura: CoberturaService,
  ) {}

  @Publico()
  @Header('Cache-Control', 'no-store')
  @Get()
  listar() {
    return this.cobertura.listar();
  }

  @Publico()
  @Header('Cache-Control', 'no-store')
  @Get(':codigo/cotizacion')
  cotizar(@Param('codigo', CodigoZonaPipe) codigo: string) {
    return this.cobertura.cotizar(codigo);
  }
}
