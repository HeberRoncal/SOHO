import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
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
} from '../autenticacion/seguridad/auth.decoradores.js';
import { objeto } from '../autenticacion/acceso/datos-auth.js';
import { PedidosService } from './pedidos.service.js';
import type { CreatePedidoDto } from './dto/create-pedido.dto.js';
import { respuestaPedido } from './dto/respuesta-pedido.js';
import { DatosPedidoPipe } from './pipes/datos-pedido.pipe.js';
import { datosCorreccion } from './pipes/datos-pago.pipe.js';
import { PagosPedidosService } from './pagos/pagos-pedidos.service.js';
import {
  SesionPedidoGuard,
  type PeticionPedido,
} from './seguridad/sesion-pedido.guard.js';

@Controller('api/pedidos')
@UseGuards(SesionPedidoGuard)
export class PedidosController {
  constructor(
    @Inject(PedidosService) private readonly pedidos: PedidosService,
    @Inject(PagosPedidosService) private readonly pagos: PagosPedidosService,
  ) {}

  @Publico()
  @Post()
  async crear(
    @Body(DatosPedidoPipe) datos: CreatePedidoDto,
    @Req() req: PeticionPedido,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resultado = await this.pedidos.crear(datos, req.identidadPedido);
    res.status(resultado.reutilizado ? 200 : 201);
    return resultado;
  }

  @Get('mios')
  @LimitarAcceso('consultar-pedido')
  listar(@Query() valor: unknown, @Req() req: PeticionPedido) {
    const q = objeto(valor, ['pagina', 'limite']);
    const entero = (valor: unknown, defecto: number, maximo: number) => {
      if (valor === undefined) return defecto;
      if (
        typeof valor !== 'string' ||
        !/^[1-9][0-9]{0,4}$/.test(valor) ||
        Number(valor) > maximo
      )
        throw new BadRequestException('La paginación no es válida.');
      return Number(valor);
    };
    return this.pedidos.listarMios(
      req.autenticacion!.usuario.id,
      entero(q.pagina, 1, 10000),
      entero(q.limite, 20, 50),
    );
  }

  @Publico()
  @Get('creacion/:clave')
  @LimitarAcceso('consultar-pedido')
  async recuperar(@Param('clave') clave: string, @Req() req: PeticionPedido) {
    return {
      pedido: respuestaPedido(
        await this.pedidos.porClave(clave, req.identidadPedido),
      ),
    };
  }

  @Publico()
  @Post(':codigo/comprobantes')
  async corregir(
    @Param('codigo') codigo: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionPedido,
  ) {
    return this.pagos.corregir(
      codigo,
      datosCorreccion(cuerpo),
      req.identidadPedido,
    );
  }

  @Publico()
  @Get(':codigo/comprobantes/:id')
  @LimitarAcceso('consultar-pedido')
  async comprobante(
    @Param('codigo') codigo: string,
    @Param('id') id: string,
    @Req() req: PeticionPedido,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    )
      throw new NotFoundException('Comprobante no encontrado.');
    const archivo = await this.pedidos.comprobante(
      codigo,
      id,
      req.identidadPedido,
    );
    const extension =
      archivo.formato === 'image/jpeg' ? 'jpg' : archivo.formato.split('/')[1];
    return new StreamableFile(archivo.contenido, {
      type: archivo.formato,
      disposition: `inline; filename="comprobante.${extension}"`,
      length: archivo.contenido.length,
    });
  }

  @Publico()
  @Get(':codigo')
  @LimitarAcceso('consultar-pedido')
  async detalle(@Param('codigo') codigo: string, @Req() req: PeticionPedido) {
    return {
      pedido: respuestaPedido(
        await this.pedidos.detalle(codigo, req.identidadPedido),
      ),
    };
  }
}
