import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Roles,
  LimitarAcceso,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { sinFiltros } from '../../productos/dto/consulta-productos.js';
import { AdministracionRecepcionesService } from './administracion-recepciones.service.js';
import { ProcesamientoRecepcionService } from './procesamiento-recepcion.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@Controller('api/admin/recepciones')
export class AdministracionRecepcionesController {
  constructor(
    @Inject(AdministracionRecepcionesService)
    private readonly recepciones: AdministracionRecepcionesService,
    @Inject(ProcesamientoRecepcionService)
    private readonly procesamiento: ProcesamientoRecepcionService,
  ) {}
  @Get()
  listar(@Query() q: unknown, @Req() req: PeticionAuth) {
    return this.recepciones.listar(q, req.autenticacion!);
  }
  @Get(':id/operaciones/:clave')
  async operacion(
    @Param('id') id: string,
    @Param('clave') clave: string,
    @Query() q: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r = await this.recepciones.operacion(id, clave, req.autenticacion!);
    res.status(r.codigoHttp);
    if (r.codigoHttp === 202) res.setHeader('Retry-After', '5');
    return r.respuesta;
  }
  @Get(':id/comprobantes/:comprobanteId')
  async comprobante(
    @Param('id') id: string,
    @Param('comprobanteId') c: string,
    @Query() q: unknown,
    @Req() req: PeticionAuth,
  ) {
    sinFiltros(q);
    const r = await this.recepciones.comprobante(id, c, req.autenticacion!);
    return new StreamableFile(r.contenido, {
      type: r.formato,
      disposition: `inline; filename="comprobante.${r.formato === 'image/jpeg' ? 'jpg' : r.formato.split('/')[1]}"`,
      length: r.contenido.length,
    });
  }
  @Post(':id/registro-pedido')
  @LimitarAcceso('crear-pedido')
  async registrar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Query() q: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r = await this.procesamiento.registrarAdmin(
      id,
      cuerpo,
      req.autenticacion!,
    );
    res.status(r.codigoHttp);
    if (r.codigoHttp === 202) res.setHeader('Retry-After', '5');
    return r.respuesta;
  }
  @Post(':id/solicitud-correccion')
  @LimitarAcceso('crear-pedido')
  async solicitar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Query() q: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r = await this.recepciones.solicitar(id, cuerpo, req.autenticacion!);
    res.status(r.codigoHttp);
    return r.respuesta;
  }
  @Get(':id')
  detalle(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() req: PeticionAuth,
  ) {
    sinFiltros(q);
    return this.recepciones.detalle(id, req.autenticacion!);
  }
}
