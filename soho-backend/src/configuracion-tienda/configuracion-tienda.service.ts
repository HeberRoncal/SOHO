import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import { DatosTienda } from './dto/datos-tienda.js';

@Injectable()
export class ConfiguracionTiendaService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
  ) {}
  private async leer(tx: Prisma.TransactionClient) {
    const c = await tx.configuracionTienda.findUnique({
      where: { id: 1 },
      include: {
        versionActual: {
          include: {
            responsable: {
              select: { id: true, nombres: true, apellidos: true },
            },
          },
        },
      },
    });
    if (!c)
      throw new ServiceUnavailableException(
        'La configuración de Tienda no está disponible.',
      );
    return c;
  }
  private async respuesta(tx: Prisma.TransactionClient) {
    const c = await this.leer(tx),
      v = c.versionActual;
    return {
      configuracion: {
        version: v?.numero ?? 0,
        actualizadoEn: v?.creadoEn.toISOString() ?? null,
        actualizadoPor: v
          ? {
              id: v.responsable.id,
              nombre: v.responsable.nombres + ' ' + v.responsable.apellidos,
            }
          : null,
        tienda: {
          correo: v?.correo ?? null,
          whatsapp: v?.whatsapp ?? null,
          horario: v?.horario ?? null,
          enlaces: v?.enlaces ?? [
            { texto: 'Ayuda con mi pedido', url: null },
            { texto: 'Cambios y devoluciones', url: null },
          ],
          politicas: {
            cambios: v?.cambios ?? null,
            privacidad: v?.privacidad ?? null,
            terminos: v?.terminos ?? null,
          },
        },
      },
    };
  }
  consultar(sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM configuracion_tienda WHERE id=1 FOR UPDATE`;
      await this.escritura.comprobarSesion(tx, sesion, true);
      return this.respuesta(tx);
    });
  }
  consultarContacto() {
    return this.escritura.transaccion(async (tx) => {
      const configuracion = await tx.configuracionTienda.findUnique({
        where: { id: 1 },
        select: {
          versionActual: {
            select: { correo: true, whatsapp: true, horario: true },
          },
        },
      });
      if (!configuracion)
        throw new ServiceUnavailableException(
          'El contacto de Tienda no está disponible.',
        );
      return {
        correo: configuracion.versionActual?.correo ?? null,
        whatsapp: configuracion.versionActual?.whatsapp ?? null,
        horario: configuracion.versionActual?.horario ?? null,
      };
    });
  }
  recuperar(clave: string, sesion: ContextoAuth) {
    const id = DatosTienda.uuid(clave);
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const op = await tx.versionConfiguracionTienda.findUnique({
        where: { claveSolicitud: id },
      });
      if (!op || op.responsableId !== sesion.usuario.id)
        throw new NotFoundException('Guardado de Tienda no encontrado.');
      return op.respuesta;
    });
  }
  actualizar(cuerpo: unknown, sesion: ContextoAuth) {
    const d = DatosTienda.guardar(cuerpo),
      hash = DatosTienda.huella({ contexto: 'configuracion-tienda-v1', ...d });
    return this.escritura.transaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM configuracion_tienda WHERE id=1 FOR UPDATE`;
      await this.escritura.comprobarSesion(tx, sesion, true);
      const anterior = await tx.versionConfiguracionTienda.findUnique({
        where: { claveSolicitud: d.claveSolicitud },
      });
      if (anterior) {
        if (
          anterior.responsableId !== sesion.usuario.id ||
          anterior.solicitudHash !== hash
        )
          throw new ConflictException(
            'La clave corresponde a otro guardado o administrador.',
          );
        return anterior.respuesta;
      }
      const actual = await this.leer(tx),
        numero = actual.versionActual?.numero ?? 0;
      if (numero !== d.versionEsperada)
        throw new ConflictException(
          'Los datos de Tienda cambiaron. Revisa la versión guardada antes de continuar.',
        );
      const { politicas, ...tienda } = d.tienda;
      const v = await tx.versionConfiguracionTienda.create({
        data: {
          configuracionId: 1,
          numero: numero + 1,
          ...tienda,
          ...politicas,
          enlaces: tienda.enlaces as Prisma.InputJsonValue,
          claveSolicitud: d.claveSolicitud,
          solicitudHash: hash,
          responsableId: sesion.usuario.id,
          respuesta: {},
        },
      });
      await tx.configuracionTienda.update({
        where: { id: 1 },
        data: { versionActualId: v.id },
      });
      const respuesta = { ...(await this.respuesta(tx)), modificada: true };
      await tx.versionConfiguracionTienda.update({
        where: { id: v.id },
        data: { respuesta: respuesta as Prisma.InputJsonValue },
      });
      return respuesta;
    });
  }
}
