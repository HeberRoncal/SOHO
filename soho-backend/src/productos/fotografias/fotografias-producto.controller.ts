import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  Roles,
  LimitarAcceso,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ErroresAuthFilter } from '../../autenticacion/seguridad/errores-auth.filter.js';
import { MultipartCsrf } from '../../autenticacion/seguridad/multipart-csrf.decorator.js';
import { idProducto, sinFiltros } from '../dto/consulta-productos.js';
import { ArchivosProductoService } from './archivos-producto.service.js';
import { GaleriaProductoService } from './galeria-producto.service.js';
import { CloudinaryService } from './cloudinary.service.js';
import { MAXIMO_FOTOGRAFIA } from './configuracion-cloudinary.js';
import type { FotografiaRecibida } from './preparar-fotografia.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErroresAuthFilter)
@Controller('api/admin/productos')
export class FotografiasProductoController {
  constructor(
    @Inject(ArchivosProductoService)
    private readonly archivos: ArchivosProductoService,
    @Inject(GaleriaProductoService)
    private readonly galeria: GaleriaProductoService,
    @Inject(CloudinaryService) private readonly cloudinary: CloudinaryService,
  ) {}
  @Get('fotografias/configuracion')
  @Header('Cache-Control', 'no-store')
  async configuracion(@Query() q: unknown) {
    sinFiltros(q);
    return {
      configurada: this.cloudinary.config.habilitada,
      modoCarpetas: this.cloudinary.config.habilitada
        ? await this.cloudinary.modoCarpetas()
        : null,
      maximoBytes: MAXIMO_FOTOGRAFIA,
      maximoImagenes: 10,
      formatos: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    };
  }
  @Post(':id/fotografias')
  @MultipartCsrf()
  @LimitarAcceso('cargar-fotografia')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: {
        fileSize: MAXIMO_FOTOGRAFIA,
        files: 1,
        fields: 1,
        fieldSize: 4096,
        parts: 2,
      },
    }),
  )
  @Header('Cache-Control', 'no-store')
  async subir(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @UploadedFile() fichero: FotografiaRecibida | undefined,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    const archivo = await this.archivos.subir(
      idProducto(id).toLowerCase(),
      cuerpo,
      fichero,
      req.autenticacion!,
    );
    res.status(archivo.estado === 'DISPONIBLE' ? 201 : 202);
    return { archivo };
  }
  @Get(':id/cargas/:clave')
  @Header('Cache-Control', 'no-store')
  async carga(
    @Param('id') id: string,
    @Param('clave') clave: string,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return {
      archivo: await this.archivos.consultar(
        idProducto(id).toLowerCase(),
        idProducto(clave).toLowerCase(),
        req.autenticacion!,
      ),
    };
  }
  @Get(':id/fotografias')
  @Header('Cache-Control', 'no-store')
  consultar(
    @Param('id') id: string,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.galeria.consultar(
      idProducto(id).toLowerCase(),
      req.autenticacion!,
    );
  }
  @Patch(':id/galeria')
  @Header('Cache-Control', 'no-store')
  guardar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.galeria.actualizar(
      idProducto(id).toLowerCase(),
      cuerpo,
      req.autenticacion!,
    );
  }
}
