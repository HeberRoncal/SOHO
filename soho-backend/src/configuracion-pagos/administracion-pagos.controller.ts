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
} from '../autenticacion/seguridad/auth.decoradores.js';
import { MultipartCsrf } from '../autenticacion/seguridad/multipart-csrf.decorator.js';
import { ErroresAuthFilter } from '../autenticacion/seguridad/errores-auth.filter.js';
import type { PeticionAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { sinFiltros } from '../productos/dto/consulta-productos.js';
import type { FotografiaRecibida } from '../productos/fotografias/preparar-fotografia.service.js';
import { ConfiguracionPagosService } from './configuracion-pagos.service.js';
import { ArchivosQrService } from './qr/archivos-qr.service.js';
import { MantenimientoQrService } from './qr/mantenimiento-qr.service.js';
import { DatosPagos } from './dto/datos-pagos.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErroresAuthFilter)
@Controller('api/admin/configuracion/pagos')
export class AdministracionPagosController {
  constructor(
    @Inject(ConfiguracionPagosService)
    private readonly pagos: ConfiguracionPagosService,
    @Inject(ArchivosQrService) private readonly archivos: ArchivosQrService,
    @Inject(MantenimientoQrService)
    private readonly mantenimiento: MantenimientoQrService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  consultar(@Req() req: PeticionAuth, @Query() q: unknown) {
    sinFiltros(q);
    return this.pagos.consultar(req.autenticacion!);
  }
  @Patch()
  @Header('Cache-Control', 'no-store')
  guardar(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.pagos.actualizar(cuerpo, req.autenticacion!);
  }
  @Get('operaciones/:clave')
  @Header('Cache-Control', 'no-store')
  operacion(
    @Param('clave') clave: string,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.pagos.recuperar(DatosPagos.uuid(clave), req.autenticacion!);
  }
  @Post('qr')
  @MultipartCsrf()
  @LimitarAcceso('cargar-fotografia')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: {
        fileSize: DatosPagos.maximoBytes,
        files: 1,
        fields: 1,
        fieldSize: 4096,
        parts: 2,
      },
    }),
  )
  @Header('Cache-Control', 'no-store')
  async subir(
    @Body() cuerpo: unknown,
    @UploadedFile() fichero: FotografiaRecibida | undefined,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    const archivo = await this.archivos.subir(
      cuerpo,
      fichero,
      req.autenticacion!,
    );
    res.status(archivo.estado === 'DISPONIBLE' ? 201 : 202);
    return { archivo };
  }
  @Get('qr/cargas/:clave')
  @Header('Cache-Control', 'no-store')
  async carga(
    @Param('clave') clave: string,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    const id = DatosPagos.uuid(clave),
      a = await this.archivos.consultar(id, req.autenticacion!);
    if (['PENDIENTE', 'CONCILIANDO'].includes(a.estado))
      await this.mantenimiento.conciliar(a);
    return {
      archivo: DatosPagos.archivo(
        await this.archivos.consultar(id, req.autenticacion!),
      ),
    };
  }
}
