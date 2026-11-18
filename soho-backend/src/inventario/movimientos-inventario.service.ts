import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import { InventarioReservadoService } from './reservas/inventario-reservado.service.js';
import { DatosMovimientoManual } from './dto/datos-movimiento-manual.js';
import {
  RespuestaInventario,
  SELECT_VARIANTE_INVENTARIO,
} from './dto/respuesta-inventario.js';
import { IdentidadProducto } from '../productos/borradores/identidad-producto.js';

function conflicto(message: string, codigo = 'INVENTARIO_CAMBIADO'): never {
  throw new ConflictException({ codigo, message });
}

@Injectable()
export class MovimientosInventarioService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
    @Inject(InventarioReservadoService)
    private readonly inventario: InventarioReservadoService,
  ) {}
  private async repetir(
    tx: Prisma.TransactionClient,
    clave: string,
    hash: string,
    sesion: ContextoAuth,
  ) {
    const m = await tx.movimientoInventario.findUnique({
      where: { claveSolicitud: clave },
    });
    if (!m) return null;
    await this.escritura.comprobarSesion(tx, sesion, true);
    if (
      m.usuarioResponsableId !== sesion.usuario.id ||
      m.solicitudHash !== hash ||
      m.origen !== 'MANUAL' ||
      !m.respuesta
    )
      conflicto(
        'La clave ya corresponde a otra solicitud.',
        'CLAVE_MOVIMIENTO_EN_USO',
      );
    return m.respuesta;
  }
  async operacion(clave: string, sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const m = await tx.movimientoInventario.findUnique({
        where: { claveSolicitud: clave },
      });
      if (
        !m ||
        m.usuarioResponsableId !== sesion.usuario.id ||
        !m.respuesta ||
        m.origen !== 'MANUAL'
      )
        throw new NotFoundException('Operación no encontrada.');
      return m.respuesta;
    });
  }
  async registrar(
    id: string,
    cuerpo: unknown,
    sesion: ContextoAuth,
  ): Promise<Prisma.JsonValue> {
    const datos = DatosMovimientoManual.leer(cuerpo),
      hash = IdentidadProducto.huella({ varianteId: id, datos });
    try {
      return await this.escritura.transaccion(async (tx) => {
        const previa = await this.repetir(
          tx,
          datos.claveSolicitud,
          hash,
          sesion,
        );
        if (previa) return previa;
        if (
          !(await tx.variante.findUnique({
            where: { id },
            select: { id: true },
          }))
        ) {
          await this.escritura.comprobarSesion(tx, sesion, true);
          throw new NotFoundException('Variante no encontrada.');
        }
        const [v] = await this.inventario.bloquear(tx, [id]);
        const repetida = await this.repetir(
          tx,
          datos.claveSolicitud,
          hash,
          sesion,
        );
        if (repetida) return repetida;
        // Autorizar después de esperar inventario permite observar una revocación confirmada.
        await this.escritura.comprobarSesion(tx, sesion, true);
        const conversion = await tx.conversionCatalogo.findUnique({
          where: { id: 1 },
          select: { realizadaEn: true },
        });
        if (!conversion?.realizadaEn)
          conflicto(
            'Completa la conversión del catálogo antes de mover inventario.',
            'CATALOGO_NO_CONVERTIDO',
          );
        if (
          v.versionExistencias !== datos.versionExistencias ||
          v.cantidadReservada !== datos.reservadoEsperado ||
          v.habilitada !== datos.habilitadaEsperada
        )
          conflicto(
            'El físico, las reservas o la habilitación cambiaron. Consulta la variante antes de confirmar.',
          );
        if (v.versionExistencias >= 4294967295)
          conflicto('La versión física alcanzó su límite.');
        const identidad = await tx.variante.findUniqueOrThrow({
          where: { id },
          select: SELECT_VARIANTE_INVENTARIO,
        });
        if (
          !identidad.productoId ||
          !identidad.producto?.grupoModeloId ||
          identidad.productoColor.productoId !== identidad.productoId ||
          identidad.producto.codigoColor !== identidad.productoColor.codigo
        )
          conflicto(
            'La identidad de la variante requiere revisión.',
            'INVENTARIO_INCONSISTENTE',
          );
        const saldo = v.existencias + datos.cantidad;
        if (saldo < 0 || saldo > 99999)
          conflicto(
            'El físico resultante debe estar entre 0 y 99,999 unidades.',
            'SALDO_FISICO_INVALIDO',
          );
        if (datos.cantidad < 0 && saldo < v.cantidadReservada)
          conflicto(
            'La reducción compromete unidades reservadas. Revisa los pedidos asociados.',
            'RESERVAS_COMPROMETIDAS',
          );
        const actualizado = await tx.variante.updateMany({
          where: {
            id,
            versionExistencias: v.versionExistencias,
            existencias: v.existencias,
            cantidadReservada: v.cantidadReservada,
            habilitada: v.habilitada,
          },
          data: { existencias: saldo, versionExistencias: { increment: 1 } },
        });
        if (actualizado.count !== 1)
          conflicto('El inventario cambió antes de guardar.');
        const responsable = await tx.usuario.findUniqueOrThrow({
          where: { id: sesion.usuario.id },
          select: { id: true, nombres: true, apellidos: true },
        });
        const variante = RespuestaInventario.variante({
          ...identidad,
          existencias: saldo,
          versionExistencias: v.versionExistencias + 1,
        });
        const movimiento = {
          id: randomUUID(),
          fecha: new Date().toISOString(),
          responsable: {
            id: responsable.id,
            nombre: [responsable.nombres, responsable.apellidos].join(' '),
          },
          productoId: variante.producto.id,
          producto: variante.producto.nombre,
          varianteId: id,
          sku: v.sku,
          color: variante.color.nombre,
          talla: variante.talla,
          tipo: datos.tipo.toLowerCase(),
          cantidad: datos.cantidad,
          saldoAnterior: v.existencias,
          saldo,
          reservado: v.cantidadReservada,
          habilitada: v.habilitada,
          disponible: variante.disponible,
          motivo: datos.motivo,
          referencia: datos.referencia,
          origen: 'manual',
          pedido: null,
        };
        const respuesta = {
          movimiento,
          variante,
          operacion: {
            claveSolicitud: datos.claveSolicitud,
            versionAnterior: v.versionExistencias,
            versionPosterior: v.versionExistencias + 1,
          },
        };
        await tx.movimientoInventario.create({
          data: {
            id: movimiento.id,
            varianteId: id,
            usuarioResponsableId: responsable.id,
            tipo: datos.tipo,
            cantidad: datos.cantidad,
            saldoAnterior: v.existencias,
            saldoPosterior: saldo,
            cantidadReservada: v.cantidadReservada,
            varianteHabilitada: v.habilitada,
            motivo: datos.motivo,
            referencia: datos.referencia,
            origen: 'MANUAL',
            fecha: new Date(movimiento.fecha),
            claveSolicitud: datos.claveSolicitud,
            solicitudHash: hash,
            respuesta,
          },
        });
        return respuesta;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return this.escritura.transaccion(async (tx) => {
          const repetida = await this.repetir(
            tx,
            datos.claveSolicitud,
            hash,
            sesion,
          );
          if (repetida) return repetida;
          await this.escritura.comprobarSesion(tx, sesion, true);
          return conflicto(
            'La clave de solicitud está en uso. Consulta su resultado.',
            'CLAVE_MOVIMIENTO_EN_USO',
          );
        });
      throw e;
    }
  }
}
