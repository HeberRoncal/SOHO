import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseFilters,
} from '@nestjs/common';
import { CatalogoService } from './catalogo.service.js';
import { leerConsultaCatalogo } from './dto/consulta-catalogo.dto.js';
import { Publico } from '../autenticacion/seguridad/auth.decoradores.js';
import { ErrorCatalogoFilter } from './filtros/error-catalogo.filter.js';

@Controller('api')
@UseFilters(ErrorCatalogoFilter)
export class CatalogoController {
  constructor(
    @Inject(CatalogoService) private readonly catalogo: CatalogoService,
  ) {}
  @Publico()
  @Get('productos')
  listar(@Query() consulta: Record<string, unknown>) {
    return this.catalogo.listar(leerConsultaCatalogo(consulta));
  }
  @Publico()
  @Get('productos/:slug')
  detalle(
    @Param('slug') slug: string,
    @Query() consulta: Record<string, unknown>,
  ) {
    if (
      Object.keys(consulta).some((k) => k !== 'color') ||
      (consulta.color !== undefined && typeof consulta.color !== 'string')
    )
      throw new BadRequestException('Consulta de producto inválida.');
    return this.catalogo.detalle(slug, consulta.color as string | undefined);
  }
  @Publico()
  @Get('marcas')
  marcas() {
    return this.catalogo.marcas();
  }
  @Publico()
  @Get('categorias')
  categorias() {
    return this.catalogo.categorias();
  }
  @Publico()
  @Get('catalogo/filtros')
  filtros() {
    return this.catalogo.filtros();
  }
}
