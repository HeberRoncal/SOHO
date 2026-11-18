export const ID_ADMIN_MOVIMIENTO = '12345678-1234-1234-1234-123456789abc';
export const ID_VARIANTE_MOVIMIENTO = '22345678-1234-1234-1234-123456789abc';
export const ID_PRODUCTO_MOVIMIENTO = '32345678-1234-1234-1234-123456789abc';
export const ID_MOVIMIENTO = '42345678-1234-1234-1234-123456789abc';
export function varianteMovimientoFixture() {
  return {
    id: ID_VARIANTE_MOVIMIENTO,
    sku: 'NK-AF107-BL-40P5',
    producto: {
      id: ID_PRODUCTO_MOVIMIENTO,
      nombre: 'Air Force Blanco',
      codigoInterno: 'SHO-0012',
      estado: 'borrador' as const,
    },
    color: { codigo: 'BL', nombre: 'Blanco' },
    talla: '40.5',
    sistemaTallas: 'EU' as const,
    habilitada: true,
    existencias: 5,
    cantidadReservada: 2,
    versionExistencias: 1,
    disponible: 3,
    faltante: 0,
  };
}
export const datosMovimientoFixture = () => ({
  sku: 'NK-AF107-BL-40P5',
  tipo: 'entrada' as const,
  sentido: 'sumar' as const,
  cantidad: '2',
  motivo: 'Reposición',
  referencia: '00123',
});
export function respuestaMovimientoFixture(cuerpo: {
  claveSolicitud: string;
  versionExistencias: number;
  reservadoEsperado: number;
  habilitadaEsperada: boolean;
  cantidad: number;
  tipo: string;
  motivo: string;
  referencia: string | null;
}) {
  const v = varianteMovimientoFixture(),
    saldo = v.existencias + cuerpo.cantidad;
  return {
    movimiento: {
      id: ID_MOVIMIENTO,
      fecha: '2026-11-15T12:00:00.000Z',
      responsable: { id: ID_ADMIN_MOVIMIENTO, nombre: 'Ana Administradora' },
      productoId: v.producto.id,
      producto: v.producto.nombre,
      varianteId: v.id,
      sku: v.sku,
      color: v.color.nombre,
      talla: v.talla,
      tipo: cuerpo.tipo.toLowerCase(),
      cantidad: cuerpo.cantidad,
      saldoAnterior: v.existencias,
      saldo,
      reservado: cuerpo.reservadoEsperado,
      habilitada: cuerpo.habilitadaEsperada,
      disponible: cuerpo.habilitadaEsperada ? Math.max(0, saldo - cuerpo.reservadoEsperado) : 0,
      motivo: cuerpo.motivo,
      referencia: cuerpo.referencia,
      origen: 'manual',
      pedido: null,
    },
    variante: {
      ...v,
      existencias: saldo,
      cantidadReservada: cuerpo.reservadoEsperado,
      habilitada: cuerpo.habilitadaEsperada,
      versionExistencias: cuerpo.versionExistencias + 1,
      disponible: cuerpo.habilitadaEsperada ? Math.max(0, saldo - cuerpo.reservadoEsperado) : 0,
      faltante: Math.max(0, cuerpo.reservadoEsperado - saldo),
    },
    operacion: {
      claveSolicitud: cuerpo.claveSolicitud,
      versionAnterior: cuerpo.versionExistencias,
      versionPosterior: cuerpo.versionExistencias + 1,
    },
  };
}
