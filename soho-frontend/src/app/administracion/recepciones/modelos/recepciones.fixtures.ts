export const ID_RECEPCION = '11111111-1111-4111-8111-111111111111';
export const ID_OTRA_RECEPCION = '22222222-2222-4222-8222-222222222222';
export const ID_COMPROBANTE = '33333333-3333-4333-8333-333333333333';
export const ID_OPERACION = '44444444-4444-4444-8444-444444444444';
export const ID_ADMIN = '55555555-5555-4555-8555-555555555555';
export function recepcionFixture() {
  const contacto = {
    nombres: 'Ana María',
    apellidos: 'De la Cruz',
    correo: 'ana@recepciones.test',
  };
  return {
    versionContrato: 1,
    id: ID_RECEPCION,
    referencia: 'REC-PRUEBA0001',
    estado: 'REQUIERE_ATENCION',
    version: 3,
    creadoEn: '2026-11-16T01:00:00.000Z',
    motivos: ['PRECIO_CAMBIADO'],
    pedido: null as { codigo: string } | null,
    comprobante: {
      id: ID_COMPROBANTE,
      version: 1,
      nombreArchivo: 'comprobante.png',
      formato: 'image/png',
      tamanoBytes: 100,
      numeroOperacion: '001234',
      estadoArchivo: 'DISPONIBLE',
      confirmadoEn: '2026-11-16T01:01:00.000Z',
    },
    instruccion: {
      versionContrato: 1,
      moneda: 'PEN',
      metodo: 'YAPE',
      importeReferencia: '199.98',
      preparacion: {
        contacto,
        entrega: {
          destinatario: 'Ana De la Cruz',
          celular: '987654321',
          distrito: 'la-esperanza',
          direccion: 'Av. Prueba 123',
          referencia: '',
        },
        facturacion: { tipo: 'BOLETA', tipoDocumento: 'DNI', numeroDocumento: '00123456' },
      },
      destino: { titular: 'SOHO pruebas', celular: '987654321' },
      verificacion: {
        distritoNombre: 'La Esperanza',
        subtotal: '199.98',
        costoEnvio: '0.00',
        total: '199.98',
        plazoEntrega: null as string | null,
        articulos: [
          {
            sku: 'NK-AF107-BL-40P5',
            nombreProducto: "Nike Air Force 1 '07 Blanco",
            color: 'Blanco',
            sistemaTalla: 'EU',
            talla: '40.5',
            cantidad: 2,
            precioUnitario: '99.99',
            importe: '199.98',
          },
        ],
      },
    },
  };
}
export function detalleRecepcionFixture() {
  return {
    recepcion: recepcionFixture(),
    diagnostico: {
      actual: { apto: false, motivos: ['PRECIO_CAMBIADO'] },
      condicionesOriginales: { apto: true, motivos: [] as string[] },
    },
    comprobantes: [recepcionFixture().comprobante],
    historial: [] as Record<string, unknown>[],
    capacidades: { registrarPedido: true, solicitarCorreccion: true },
  };
}
export function listadoRecepcionesFixture() {
  const r = recepcionFixture();
  return {
    recepciones: [
      {
        id: r.id,
        referencia: r.referencia,
        estado: r.estado,
        version: r.version,
        creadoEn: r.creadoEn,
        contacto: r.instruccion.preparacion.contacto,
        metodo: 'YAPE',
        importeReferencia: '199.98',
        distrito: 'la-esperanza',
        motivos: r.motivos,
        pedido: null,
        comprador: 'INVITADO',
      },
    ],
    paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
    resumen: { RECIBIENDO: 2, RECIBIDA: 4, REQUIERE_ATENCION: 9, PEDIDO_CREADO: 3 },
  };
}
export function resultadoRecepcionFixture(clave: string, correccion = false, pendiente = false) {
  const recepcion = recepcionFixture();
  if (!pendiente) {
    recepcion.version = 4;
    if (correccion) recepcion.motivos.push('COMPROBANTE_REQUIERE_CORRECCION');
    else {
      recepcion.estado = 'PEDIDO_CREADO';
      recepcion.motivos = [];
      recepcion.pedido = { codigo: 'SOHO-TEST000001' };
    }
  }
  return {
    recepcion,
    operacion: { claveSolicitud: clave, estado: pendiente ? 'PENDIENTE' : 'CONFIRMADA' },
    resultado: pendiente ? null : correccion ? 'SOLICITAR_CORRECCION' : 'PEDIDO_CREADO',
    pedido: recepcion.pedido,
    ...(correccion
      ? {
          correccion: {
            solicitudId: ID_OPERACION,
            mensaje: 'Adjunta una imagen legible de la misma transferencia.',
          },
        }
      : {}),
  };
}
