import { proveerAdministracionPrueba } from '../../pedidos/pruebas/administracion.fixture';
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerAdministracionPrueba()] });
});
import { TestBed } from '@angular/core/testing';
import { SolicitudesAdministracion } from './solicitudes-administracion';
import { PedidosAdministracionPrueba as PedidosAdministracion } from '../../pedidos/pruebas/pedidos-administracion.fixture';
import { PedidosAdministracion as FuentePedidos } from '../../pedidos/servicios/pedidos-administracion';
import { PagosAdministracionPrueba as PagosAdministracion } from '../../pagos/pruebas/pagos-administracion.fixture';
import {
  ProductosAdministracionPrueba as ProductosAdministracion,
  proveerProductosAdministracionPrueba,
} from '../../productos/pruebas/productos-administracion.fixture';
import { PEDIDOS_ADMIN_DEMO } from '../datos/pedidos-posventa-demo';
import { SOLICITUDES_ADMIN_DEMO } from '../datos/solicitudes-admin-demo';
import {
  AccionSolicitud,
  DecisionSolicitud,
  NuevaSolicitud,
  importeReferenciaSolicitud,
} from '../modelos/solicitud-admin';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerProductosAdministracionPrueba()] });
});

describe('Cambios y devoluciones de demostración', () => {
  let fuente: SolicitudesAdministracion,
    pedidos: PedidosAdministracion,
    productos: ProductosAdministracion;
  const nuevos = (extra: Partial<NuevaSolicitud> = {}): NuevaSolicitud => ({
    pedido: 'SOHO-000119',
    sku: PEDIDOS_ADMIN_DEMO.find((p) => p.codigo === 'SOHO-000119')!.articulos[0].sku,
    tipo: 'devolucion',
    cantidad: 1,
    motivo: 'defecto',
    descripcion: 'El cliente de ejemplo informa un defecto en el producto.',
    variante: '',
    confirmado: true,
    evidencias: [],
    ...extra,
  });
  const decision = (id: string, accion: AccionSolicitud, extra: Partial<DecisionSolicitud> = {}) =>
    fuente.decidir(id, {
      accion,
      revision: fuente.obtener(id)!.revision,
      confirmado: true,
      motivo: 'No hay información suficiente del caso de ejemplo.',
      condicion: 'bueno',
      referencia: 'DEMO-OPERACION-001',
      ...extra,
    });
  beforeEach(() => {
    TestBed.configureTestingModule({});
    fuente = TestBed.inject(SolicitudesAdministracion);
    pedidos = TestBed.inject(PedidosAdministracion);
    productos = TestBed.inject(ProductosAdministracion);
  });
  it('reconcilia ejemplos con los mismos pedidos y libera cantidades de un caso rechazado', () => {
    expect(fuente.solicitudes()).toBe(SOLICITUDES_ADMIN_DEMO);
    expect(fuente.resumen()).toEqual({ total: 2, abiertas: 1, evaluacion: 1, cerradas: 0 });
    expect(fuente.pedidosElegibles()).toHaveLength(2);
    expect(fuente.pendientes('SOHO-000120', fuente.obtener('CD-000002')!.articulo.sku)).toBe(0);
    expect(fuente.pendientes('SOHO-000119', nuevos().sku)).toBe(1);
    expect(fuente.obtener('no-existe')).toBeUndefined();
    for (const s of fuente.solicitudes())
      expect(s.cliente).toBe(pedidos.obtener(s.pedido)!.cliente);
  });
  it('exige pedido entregado y pagado, artículo propio, cantidad válida y confirmación', () => {
    for (const datos of [
      nuevos({ pedido: 'SOHO-000128' }),
      nuevos({ pedido: 'SOHO-000121' }),
      nuevos({ pedido: 'SOHO-000117' }),
      nuevos({ pedido: 'no-existe' }),
      nuevos({ sku: 'SKU-ajeno' }),
      nuevos({ cantidad: 0 }),
      nuevos({ cantidad: 1.5 }),
      nuevos({ cantidad: 2 }),
      nuevos({ confirmado: false }),
      nuevos({ motivo: 'toString' }),
      nuevos({ descripcion: 'corto' }),
      nuevos({ descripcion: 'x'.repeat(1001) }),
    ]) {
      expect(fuente.crear(datos).ok).toBe(false);
    }
    expect(fuente.solicitudes()).toHaveLength(2);
    expect(fuente.hayCambios()).toBe(false);
  });
  it('registra un caso inmutable, conserva precio histórico y excluye el envío', () => {
    const p = pedidos.obtener('SOHO-000119')!,
      datos = nuevos();
    const creado = fuente.crear(datos);
    expect(creado.ok).toBe(true);
    expect(creado.identificador).toBe('CD-000003');
    const s = fuente.obtener(creado.identificador!)!;
    expect(s.importeReferencia).toBe(p.total - p.envio);
    expect(s.articulo).toBe(p.articulos[0]);
    expect(s.variante).toBeUndefined();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.eventos)).toBe(true);
    expect(s.unidades).toEqual([0]);
    expect(fuente.crear(datos).ok).toBe(false);
    expect(pedidos.obtener(p.codigo)).toBe(p);
  });
  it('valida evidencia local y congela sus metadatos sin alterar el archivo de entrada', () => {
    const e = {
      nombre: 'foto.png',
      tipo: 'image/png',
      bytes: 68,
      imagen: 'data:image/png;base64,iVBORw0KGgo=',
    };
    expect(fuente.crear(nuevos({ evidencias: [{ ...e, tipo: 'image/svg+xml' }] })).ok).toBe(false);
    expect(fuente.crear(nuevos({ evidencias: [{ ...e, bytes: 2097153 }] })).ok).toBe(false);
    expect(fuente.crear(nuevos({ evidencias: Array(4).fill(e) })).ok).toBe(false);
    const id = fuente.crear(nuevos({ evidencias: [e] })).identificador!;
    e.nombre = 'cambiado.png';
    expect(fuente.obtener(id)!.evidencias[0].nombre).toBe('foto.png');
    expect(Object.isFrozen(fuente.obtener(id)!.evidencias[0])).toBe(true);
  });
  it('solo admite variantes diferentes, disponibles y del mismo modelo', () => {
    const datos = nuevos({ tipo: 'cambio', variante: nuevos().sku });
    expect(fuente.crear(datos).ok).toBe(false);
    const ajena = fuente.obtener('CD-000002')!.variante!.sku;
    expect(fuente.crear({ ...datos, variante: ajena }).ok).toBe(false);
    const v = fuente.variantes(datos.sku).find((v) => v.disponible > 0)!;
    expect(fuente.crear({ ...datos, variante: v.sku }).ok).toBe(true);
  });
  it('recorre aprobación, retorno y cierre de cambio sin mover inventario, pedidos o pagos', () => {
    const inventario = productos.productos(),
      ordenes = pedidos.pedidos;
    expect(decision('CD-000002', 'recibir').ok).toBe(false);
    expect(decision('CD-000002', 'aprobar').ok).toBe(true);
    expect(fuente.obtener('CD-000002')!.estado).toBe('retorno');
    expect(decision('CD-000002', 'cerrar-cambio').ok).toBe(false);
    expect(decision('CD-000002', 'recibir', { condicion: '' }).ok).toBe(false);
    expect(decision('CD-000002', 'recibir').ok).toBe(true);
    expect(fuente.obtener('CD-000002')!.estado).toBe('aprobada');
    expect(decision('CD-000002', 'cerrar-cambio', { referencia: 'a' }).ok).toBe(false);
    expect(decision('CD-000002', 'cerrar-cambio').ok).toBe(true);
    expect(fuente.obtener('CD-000002')!.estado).toBe('cerrada');
    expect(fuente.obtener('CD-000002')!.eventos).toHaveLength(4);
    expect(decision('CD-000002', 'cerrar-cambio').ok).toBe(false);
    expect(productos.productos()).toBe(inventario);
    expect(productos.movimientos()).toEqual([]);
    expect(pedidos.pedidos).toBe(ordenes);
  });
  it('bloquea un cambio si desaparece la disponibilidad al aprobar o al cerrar', () => {
    const producto = fuente.obtener('CD-000002')!.variante!.productoId;
    productos.archivar(producto);
    expect(decision('CD-000002', 'aprobar').ok).toBe(false);
    productos.restablecer();
    expect(decision('CD-000002', 'aprobar').ok).toBe(true);
    expect(decision('CD-000002', 'recibir').ok).toBe(true);
    productos.archivar(producto);
    expect(decision('CD-000002', 'cerrar-cambio').ok).toBe(false);
    expect(fuente.obtener('CD-000002')!.estado).toBe('aprobada');
  });
  it('requiere retorno y referencia para registrar un reembolso simulado, conservando el pago', () => {
    const original = pedidos.obtener('SOHO-000119')!,
      id = fuente.crear(nuevos()).identificador!;
    expect(decision(id, 'reembolso').ok).toBe(false);
    expect(decision(id, 'aprobar').ok).toBe(true);
    expect(decision(id, 'recibir', { condicion: 'defecto' }).ok).toBe(true);
    expect(decision(id, 'cerrar-cambio').ok).toBe(false);
    expect(decision(id, 'reembolso', { confirmado: false }).ok).toBe(false);
    expect(decision(id, 'reembolso', { referencia: ' ' }).ok).toBe(false);
    expect(decision(id, 'reembolso').ok).toBe(true);
    expect(fuente.obtener(id)!.cierre!.referencia).toBe('DEMO-OPERACION-001');
    expect(pedidos.obtener(original.codigo)).toBe(original);
    expect(original.estadoPago).toBe('aprobado');
    expect(fuente.crear(nuevos()).ok).toBe(false);
  });
  it('rechazar exige motivo y libera el par; los terminales no se pueden reabrir', () => {
    expect(decision('CD-000002', 'rechazar', { motivo: 'corto' }).ok).toBe(false);
    expect(decision('CD-000002', 'rechazar').ok).toBe(true);
    const s = fuente.obtener('CD-000002')!;
    expect(fuente.pendientes(s.pedido, s.articulo.sku)).toBe(1);
    expect(fuente.acciones(s)).toEqual([]);
    expect(decision(s.identificador, 'aprobar').ok).toBe(false);
  });
  it('notas con límites y revisiones obsoletas no sobrescriben la atención actual', () => {
    const anterior = fuente.obtener('CD-000002')!;
    expect(fuente.guardarNota(anterior.identificador, '  ').ok).toBe(false);
    expect(fuente.guardarNota(anterior.identificador, 'x'.repeat(501)).ok).toBe(false);
    expect(
      fuente.guardarNota(anterior.identificador, '  Coordinar con el cliente de ejemplo.  ').ok,
    ).toBe(true);
    expect(anterior.notas).toHaveLength(0);
    expect(fuente.obtener(anterior.identificador)!.notas[0].texto).toBe(
      'Coordinar con el cliente de ejemplo.',
    );
    expect(decision(anterior.identificador, 'aprobar', { revision: anterior.revision }).ok).toBe(
      false,
    );
    expect(decision(anterior.identificador, 'aprobar').ok).toBe(true);
    expect(
      fuente.decidir('no-existe', {
        accion: 'aprobar',
        revision: 1,
        confirmado: true,
        motivo: '',
        referencia: '',
        condicion: '',
      }).ok,
    ).toBe(false);
  });
  it('reconcilia descuentos de céntimos en cantidades parciales y reutiliza el mismo par al rechazar', () => {
    TestBed.resetTestingModule();
    const p = {
      ...PEDIDOS_ADMIN_DEMO.find((p) => p.codigo === 'SOHO-000124')!,
      estadoEntrega: 'entregado' as const,
      descuento: 0.01,
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FuentePedidos,
          useValue: {
            pedidos: [p],
            obtener: (codigo: string) => (codigo === p.codigo ? p : undefined),
          },
        },
      ],
    });
    fuente = TestBed.inject(SolicitudesAdministracion);
    const datos = nuevos({ pedido: p.codigo, sku: p.articulos[0].sku });
    const primero = fuente.crear(datos).identificador!,
      segundo = fuente.crear(datos).identificador!;
    expect(
      fuente.obtener(primero)!.importeReferencia + fuente.obtener(segundo)!.importeReferencia,
    ).toBe(559.79);
    expect(decision(primero, 'rechazar').ok).toBe(true);
    const tercero = fuente.crear(datos).identificador!;
    expect(fuente.obtener(tercero)!.unidades).toEqual([0]);
    expect(
      fuente.obtener(tercero)!.importeReferencia + fuente.obtener(segundo)!.importeReferencia,
    ).toBe(559.79);
    expect(importeReferenciaSolicitud(p, datos.sku, 2)).toBe(559.79);
  });
  it('restablece únicamente solicitudes y conserva las decisiones de pago y los cambios de catálogo', () => {
    const pagos = TestBed.inject(PagosAdministracion),
      pago = pagos.obtener('SOHO-000128')!;
    pagos.revisar(pago.pedido.codigo, {
      accion: 'aprobado',
      comprobanteId: pago.comprobantes[0].id,
      confirmado: true,
      motivo: '',
      mensaje: '',
      solicitud: 'legible',
    });
    productos.archivar('suede');
    const inventario = productos.productos();
    fuente.guardarNota('CD-000002', 'Nota interna de demostración.');
    fuente.restablecer();
    expect(fuente.solicitudes()).toBe(SOLICITUDES_ADMIN_DEMO);
    expect(fuente.hayCambios()).toBe(false);
    expect(pedidos.obtener('SOHO-000128')!.estadoPago).toBe('aprobado');
    expect(productos.productos()).toBe(inventario);
  });
});
