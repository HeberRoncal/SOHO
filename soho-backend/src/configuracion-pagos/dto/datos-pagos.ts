import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ArchivoQrPago,
  MetodoPagoPedido,
} from '../../generated/prisma/client.js';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';

export class DatosPagos {
  static readonly maximoBytes = 2 * 1024 * 1024;
  static uuid(v: unknown) {
    if (
      typeof v !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    )
      throw new BadRequestException('El identificador debe ser UUID.');
    return v.toLowerCase();
  }
  static metodo(v: unknown): MetodoPagoPedido {
    if (v !== 'YAPE' && v !== 'PLIN')
      throw new BadRequestException('Método de pago no válido.');
    return v;
  }
  static guardar(v: unknown) {
    const d = objeto(v, [
      'claveSolicitud',
      'versionEsperada',
      'confirmado',
      'metodos',
    ]);
    if (d.confirmado !== true)
      throw new BadRequestException(
        'Confirma los datos receptores antes de publicar.',
      );
    if (
      typeof d.versionEsperada !== 'number' ||
      !Number.isSafeInteger(d.versionEsperada) ||
      d.versionEsperada < 0 ||
      d.versionEsperada >= 4294967295
    )
      throw new BadRequestException('La versión esperada no es válida.');
    if (!Array.isArray(d.metodos) || d.metodos.length !== 2)
      throw new BadRequestException('Envía YAPE y PLIN juntos.');
    const metodos = d.metodos
      .map((v: unknown) => {
        const m = objeto(v, ['metodo', 'activo', 'celular', 'titular', 'qrId']);
        if (typeof m.activo !== 'boolean')
          throw new BadRequestException('La activación debe ser booleana.');
        const celular = this.texto(m.celular, 9),
          titular = this.texto(m.titular, 120);
        if (celular !== null && !/^9[0-9]{8}$/.test(celular))
          throw new BadRequestException(
            'El celular debe tener nueve dígitos y empezar por 9.',
          );
        if (m.activo && (!celular || !titular))
          throw new BadRequestException(
            'Un método activo exige celular y titular.',
          );
        return {
          metodo: this.metodo(m.metodo),
          activo: m.activo,
          celular,
          titular,
          qrId: m.qrId === null ? null : this.uuid(m.qrId),
        };
      })
      .sort((a, b) =>
        a.metodo === b.metodo ? 0 : a.metodo === 'YAPE' ? -1 : 1,
      );
    if (new Set(metodos.map((m) => m.metodo)).size !== 2)
      throw new BadRequestException('No repitas métodos.');
    const qr = metodos.flatMap((m) => (m.qrId ? [m.qrId] : []));
    if (new Set(qr).size !== qr.length)
      throw new BadRequestException('Cada QR corresponde a un solo método.');
    return {
      claveSolicitud: this.uuid(d.claveSolicitud),
      versionEsperada: d.versionEsperada,
      confirmado: true,
      metodos,
    };
  }
  private static texto(v: unknown, maximo: number): string | null {
    if (v === null) return null;
    if (typeof v !== 'string' || /[\p{Cc}\p{Cf}]/u.test(v))
      throw new BadRequestException('Texto no válido.');
    const t = v.normalize('NFC').trim();
    if (t.length > maximo)
      throw new BadRequestException('El texto supera el límite permitido.');
    return t || null;
  }
  static carga(v: unknown) {
    const d = objeto(v, ['datos']);
    if (typeof d.datos !== 'string' || d.datos.length > 4096)
      throw new BadRequestException('Envía datos como JSON.');
    let valor: unknown;
    try {
      valor = JSON.parse(d.datos);
    } catch {
      throw new BadRequestException('JSON no válido.');
    }
    const q = objeto(valor, ['claveCarga', 'metodo']);
    return {
      claveCarga: this.uuid(q.claveCarga),
      metodo: this.metodo(q.metodo),
    };
  }
  static huella(v: unknown) {
    return createHash('sha256').update(JSON.stringify(v)).digest('hex');
  }
  static archivo(a: ArchivoQrPago) {
    return {
      id: a.id,
      metodo: a.metodo,
      estado: a.estado,
      proveedor: a.proveedor,
      nombre: a.nombreOriginal,
      url: a.estado === 'DISPONIBLE' ? a.urlEntrega : null,
      cloudName: a.cloudName,
      publicId: a.publicId,
      assetId: a.assetId,
      versionCloudinary: a.versionCloudinary?.toString() ?? null,
      formato: a.formato,
      ancho: a.ancho,
      alto: a.alto,
      bytes: a.bytes,
      creadoEn: a.creadoEn.toISOString(),
      revisionEn: a.proximaRevisionEn?.toISOString() ?? null,
      limpiezaDesde: a.limpiarDesde?.toISOString() ?? null,
    };
  }
}
