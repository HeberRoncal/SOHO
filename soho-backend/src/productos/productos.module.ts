import { Module } from '@nestjs/common';
import { AdministracionProductosController } from './administracion-productos.controller.js';
import { ConsultaProductosService } from './consulta-productos.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { BorradoresProductoService } from './borradores/borradores-producto.service.js';
import { BorradoresProductoController } from './borradores/borradores-producto.controller.js';
import { CloudinaryModule } from '../archivos/cloudinary.module.js';
import { PrepararFotografiaService } from './fotografias/preparar-fotografia.service.js';
import { ArchivosProductoService } from './fotografias/archivos-producto.service.js';
import { GaleriaProductoService } from './fotografias/galeria-producto.service.js';
import { MantenimientoFotografiasService } from './fotografias/mantenimiento-fotografias.service.js';
import { ProcesadorFotografiasService } from './fotografias/procesador-fotografias.service.js';
import { FotografiasProductoController } from './fotografias/fotografias-producto.controller.js';
import { PublicacionProductoService } from './publicacion/publicacion-producto.service.js';
import { PublicacionProductoController } from './publicacion/publicacion-producto.controller.js';
import { ArchivoProductoController } from './archivo/archivo-producto.controller.js';
import { ArchivoProductoService } from './archivo/archivo-producto.service.js';
import { PublicadosProductoController } from './publicados/publicados-producto.controller.js';
import { PublicadosProductoService } from './publicados/publicados-producto.service.js';

@Module({
  imports: [PrismaModule, AutenticacionModule, CloudinaryModule],
  controllers: [
    AdministracionProductosController,
    BorradoresProductoController,
    FotografiasProductoController,
    PublicacionProductoController,
    ArchivoProductoController,
    PublicadosProductoController,
  ],
  providers: [
    ConsultaProductosService,
    BorradoresProductoService,
    PrepararFotografiaService,
    ArchivosProductoService,
    GaleriaProductoService,
    MantenimientoFotografiasService,
    ProcesadorFotografiasService,
    PublicacionProductoService,
    ArchivoProductoService,
    PublicadosProductoService,
  ],
})
export class ProductosModule {}
