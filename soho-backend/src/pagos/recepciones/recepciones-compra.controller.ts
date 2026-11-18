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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Publico,
  LimitarAcceso,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import {
  SesionPedidoGuard,
  type PeticionPedido,
} from '../../pedidos/seguridad/sesion-pedido.guard.js';
import { sinFiltros } from '../../productos/dto/consulta-productos.js';
import { RecepcionesCompraService } from './recepciones-compra.service.js';
import { ProcesamientoRecepcionService } from './procesamiento-recepcion.service.js';
import { CorreccionesRecepcionService } from './correcciones-recepcion.service.js';

@Publico()
@UseGuards(SesionPedidoGuard)
@Controller('api/pagos/recepciones')
export class RecepcionesCompraController {
  constructor(
    @Inject(RecepcionesCompraService)
    private readonly recepciones: RecepcionesCompraService,
    @Inject(ProcesamientoRecepcionService)
    private readonly procesamiento: ProcesamientoRecepcionService,
    @Inject(CorreccionesRecepcionService)
    private readonly correcciones: CorreccionesRecepcionService,
  ) {}

  @Post()
  async recibir(
    @Body() cuerpo: unknown,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r = await this.recepciones.recibir(cuerpo, req.identidadPedido);
    res.status(r.codigoHttp);
    if (r.codigoHttp === 202) res.setHeader('Retry-After', '5');
    return r.respuesta;
  }

  @Get('creacion/:clave')
  @LimitarAcceso('consultar-pedido')
  porClave(
    @Param('clave') clave: string,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.recepciones.porClave(clave, req.identidadPedido);
  }

  @Post(':id/procesamiento')
  @LimitarAcceso('crear-pedido')
  async procesar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r = await this.procesamiento.procesar(
      id,
      cuerpo,
      req.identidadPedido,
    );
    res.status(r.codigoHttp);
    if (r.codigoHttp === 202) res.setHeader('Retry-After', '5');
    return r.respuesta;
  }

  @Get(':id/operaciones/:clave')
  @LimitarAcceso('consultar-pedido')
  async operacion(
    @Param('id') id: string,
    @Param('clave') clave: string,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r =
      (await this.correcciones.recuperarSiExiste(
        id,
        clave,
        req.identidadPedido,
      )) ??
      (await this.procesamiento.recuperar(id, clave, req.identidadPedido));
    res.status(r.codigoHttp);
    if (r.codigoHttp === 202) res.setHeader('Retry-After', '5');
    return r.respuesta;
  }

  @Get(':id/comprobantes/:comprobanteId')
  @LimitarAcceso('consultar-pedido')
  async comprobante(
    @Param('id') id: string,
    @Param('comprobanteId') comprobanteId: string,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    const a = await this.recepciones.comprobante(
        id,
        comprobanteId,
        req.identidadPedido,
      ),
      extension = a.formato === 'image/jpeg' ? 'jpg' : a.formato.split('/')[1];
    return new StreamableFile(a.contenido, {
      type: a.formato,
      disposition: `inline; filename="comprobante.${extension}"`,
      length: a.contenido.length,
    });
  }

  @Post(':id/comprobantes')
  async corregir(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Query() q: unknown,
    @Req() req: PeticionPedido,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r = await this.correcciones.adjuntar(id, cuerpo, req.identidadPedido);
    res.status(r.codigoHttp);
    if (r.codigoHttp === 202) res.setHeader('Retry-After', '5');
    return r.respuesta;
  }

  @Get(':id')
  @LimitarAcceso('consultar-pedido')
  porId(
    @Param('id') id: string,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.recepciones.porId(id, req.identidadPedido);
  }
}
