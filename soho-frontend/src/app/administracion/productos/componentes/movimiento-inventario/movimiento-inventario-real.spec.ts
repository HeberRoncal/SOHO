import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MovimientoInventarioReal } from './movimiento-inventario-real';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { ProductosAdministracion } from '../../servicios/productos-administracion';
import {
  ErrorMovimientoInventario,
  MovimientosInventarioApi,
} from '../../servicios/movimientos-inventario-api';
import {
  datosMovimientoFixture,
  ID_ADMIN_MOVIMIENTO,
  respuestaMovimientoFixture,
  varianteMovimientoFixture,
} from '../../modelos/movimientos-inventario.fixtures';
import { resultadoMovimiento, solicitudMovimiento } from '../../modelos/movimientos-inventario-api';
describe('Diálogo real de movimientos', () => {
  let f: ComponentFixture<MovimientoInventarioReal>, c: MovimientoInventarioReal;
  const v = varianteMovimientoFixture(),
    perfil = signal<{ id: string; rol: string } | null>(null);
  const api = {
      buscar: vi.fn(),
      detalle: vi.fn(),
      pendiente: vi.fn(),
      registrar: vi.fn(),
      recuperar: vi.fn(),
    },
    fuente = { actualizarInventario: vi.fn() };
  function exito() {
    const cuerpo = solicitudMovimiento(v, datosMovimientoFixture()),
      r = resultadoMovimiento(
        respuestaMovimientoFixture(cuerpo),
        { varianteId: v.id, cuerpo, incierto: false },
        ID_ADMIN_MOVIMIENTO,
      );
    return { ...r, actual: r.variante };
  }
  async function montar(sku = '') {
    TestBed.configureTestingModule({
      imports: [MovimientoInventarioReal],
      providers: [
        { provide: Cuenta, useValue: { perfil } },
        { provide: MovimientosInventarioApi, useValue: api },
        { provide: ProductosAdministracion, useValue: fuente },
      ],
    });
    f = TestBed.createComponent(MovimientoInventarioReal);
    c = f.componentInstance;
    f.componentRef.setInput('skuInicial', sku);
    f.componentRef.setInput('abierto', true);
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    f.detectChanges();
    for (const d of f.nativeElement.querySelectorAll('dialog') as HTMLDialogElement[]) {
      d.showModal = () => {
        d.open = true;
      };
      d.close = () => {
        d.open = false;
      };
    }
    await f.whenStable();
    f.detectChanges();
  }
  async function seleccionar() {
    await c['elegir']({ target: { value: v.id } } as unknown as Event);
    c['formulario'].patchValue(datosMovimientoFixture());
    f.detectChanges();
  }
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function () {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value: function () {
        this.open = false;
      },
    });
    vi.resetAllMocks();
    perfil.set({ id: ID_ADMIN_MOVIMIENTO, rol: 'ADMIN' });
    api.buscar.mockResolvedValue({
      variantes: [v],
      paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
    });
    api.detalle.mockResolvedValue(v);
    api.pendiente.mockReturnValue(null);
    api.registrar.mockResolvedValue(exito());
    api.recuperar.mockResolvedValue(exito());
    fuente.actualizarInventario.mockResolvedValue(true);
  });
  afterEach(() => {
    f?.destroy();
    TestBed.resetTestingModule();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  it('carga opciones remotas y resuelve un SKU inicial fuera del listado', async () => {
    await montar(v.sku);
    expect(api.buscar).toHaveBeenCalledWith({ sku: v.sku, producto: '', limite: '1' });
    expect(api.detalle).toHaveBeenCalledWith(v.id);
    expect(c['seleccion']()?.id).toBe(v.id);
    expect(c['formulario'].getRawValue().sku).toBe(v.sku);
    expect((f.nativeElement.querySelector('#mv-variante') as HTMLSelectElement).value).toBe(v.id);
  });
  it('consulta otra página con el mismo filtro sin cambiar la selección', async () => {
    await montar();
    await seleccionar();
    c['busqueda'].set('NK');
    await c['buscar'](1);
    expect(api.buscar).toHaveBeenLastCalledWith({ busqueda: 'NK', producto: '', pagina: '2' });
    expect(c['seleccion']()?.id).toBe(v.id);
  });
  it('una búsqueda fallida muestra reintento y conserva campos', async () => {
    await montar();
    await seleccionar();
    api.buscar.mockRejectedValue(new Error('No disponible'));
    await c['buscar']();
    expect(c['errorBusqueda']()).toBe('No disponible');
    expect(c['formulario'].getRawValue().motivo).toBe('Reposición');
  });
  it('ignora una respuesta de búsqueda anterior', async () => {
    await montar();
    let resolver!: (r: unknown) => void;
    api.buscar.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    const a = c['buscar']();
    api.buscar.mockResolvedValueOnce({
      variantes: [],
      paginacion: { pagina: 1, limite: 20, total: 0, paginas: 0 },
    });
    await c['buscar']();
    resolver({ variantes: [v], paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 } });
    await a;
    expect(c['opciones']()).toEqual([]);
  });
  it('requiere revisar y confirmar antes de enviar', async () => {
    await montar();
    await seleccionar();
    c['revisar']();
    expect(c['etapa']()).toBe('confirmar');
    expect(api.registrar).not.toHaveBeenCalled();
    await c['guardar']();
    expect(api.registrar).toHaveBeenCalledWith(v, datosMovimientoFixture());
    expect(fuente.actualizarInventario).toHaveBeenCalledWith(v.producto.id);
  });
  it('impide doble clic al confirmar', async () => {
    await montar();
    await seleccionar();
    let resolver!: (v: unknown) => void;
    api.registrar.mockReturnValue(new Promise((r) => (resolver = r)));
    c['revisar']();
    const p = c['guardar']();
    await c['guardar']();
    expect(api.registrar).toHaveBeenCalledTimes(1);
    resolver(exito());
    await p;
  });
  it.each(['0', '1.5', '100000', 'abc'])(
    'rechaza cantidad inválida %s sin enviar',
    async (cantidad) => {
      await montar();
      await seleccionar();
      c['formulario'].patchValue({ cantidad });
      c['revisar']();
      expect(c['listaErrores']().length).toBeGreaterThan(0);
      expect(c['etapa']()).toBe('editar');
      await c['guardar']();
      expect(api.registrar).not.toHaveBeenCalled();
    },
  );
  it('bloquea reducciones que comprometen reservas y conserva el contador', async () => {
    await montar();
    await seleccionar();
    c['formulario'].patchValue({ tipo: 'salida', cantidad: '4' });
    c['revisar']();
    expect(c['errores']().cantidad).toContain('reservadas');
    expect(c['seleccion']()?.cantidadReservada).toBe(2);
  });
  it('permite una reposición parcial de un déficit previo', async () => {
    await montar();
    await seleccionar();
    c['seleccion'].set({ ...v, existencias: 1, cantidadReservada: 3, disponible: 0, faltante: 2 });
    c['formulario'].patchValue({ cantidad: '1' });
    c['revisar']();
    expect(c['etapa']()).toBe('confirmar');
    expect(c['evaluacion']().saldo).toBe(2);
    expect(c['evaluacion']().bajoReservas).toBe(true);
    expect(c['evaluacion']().errores).toEqual({});
  });
  it('conserva el formulario cuando se rechaza y exige actualizar ante conflicto', async () => {
    await montar();
    await seleccionar();
    api.registrar.mockRejectedValue(new ErrorMovimientoInventario('Cambió el inventario', 409));
    c['revisar']();
    await c['guardar']();
    expect(c['formulario'].getRawValue().motivo).toBe('Reposición');
    expect(c['conflicto']()).toBe(true);
    c['revisar']();
    expect(c['etapa']()).toBe('editar');
    api.detalle.mockResolvedValue({ ...v, versionExistencias: 2, existencias: 6, disponible: 4 });
    await c['actualizarSaldos']();
    expect(c['conflicto']()).toBe(false);
    expect(c['formulario'].getRawValue().cantidad).toBe('2');
  });
  it('mantiene campos y bloquea otra escritura ante respuesta perdida', async () => {
    await montar();
    await seleccionar();
    api.pendiente.mockReturnValue({
      varianteId: v.id,
      cuerpo: solicitudMovimiento(v, datosMovimientoFixture()),
      incierto: true,
    });
    api.registrar.mockRejectedValue(new ErrorMovimientoInventario('Resultado incierto', 0, true));
    c['revisar']();
    await c['guardar']();
    expect(c['pendiente']()).toBe(true);
    expect(c['formulario'].getRawValue().motivo).toBe('Reposición');
    c['revisar']();
    await c['guardar']();
    expect(api.registrar).toHaveBeenCalledTimes(1);
    await c['recuperar']();
    expect(api.recuperar).toHaveBeenCalledWith(false);
    expect(c['pendiente']()).toBe(false);
  });
  it('recupera la solicitud guardada al reabrir y no envía un POST automáticamente', async () => {
    api.pendiente.mockReturnValue({
      varianteId: v.id,
      cuerpo: solicitudMovimiento(v, datosMovimientoFixture()),
      incierto: true,
    });
    await montar();
    expect(c['pendiente']()).toBe(true);
    expect(c['formulario'].getRawValue()).toMatchObject(datosMovimientoFixture());
    expect(api.registrar).not.toHaveBeenCalled();
    expect(api.recuperar).not.toHaveBeenCalled();
  });
  it('un 404 de recuperación conserva pendiente y sus campos', async () => {
    api.pendiente.mockReturnValue({
      varianteId: v.id,
      cuerpo: solicitudMovimiento(v, datosMovimientoFixture()),
      incierto: true,
    });
    await montar();
    api.recuperar.mockRejectedValue(new ErrorMovimientoInventario('No encontrado', 404, true));
    await c['recuperar']();
    expect(c['pendiente']()).toBe(true);
    expect(c['formulario'].getRawValue().cantidad).toBe('2');
  });
  it('si falla la actualización posterior solo reintenta consultas', async () => {
    await montar();
    await seleccionar();
    fuente.actualizarInventario.mockResolvedValueOnce(false);
    c['revisar']();
    await c['guardar']();
    expect(c['confirmado']()).not.toBeNull();
    expect(c['error']()).toContain('confirmado');
    await c['actualizarConsultas']();
    expect(fuente.actualizarInventario).toHaveBeenCalledTimes(2);
    expect(api.registrar).toHaveBeenCalledTimes(1);
  });
  it('advierte al cerrar y permite conservar o descartar los campos', async () => {
    await montar();
    await seleccionar();
    const p = c.puedeSalir();
    expect(p).toBeInstanceOf(Promise);
    c['resolverCierre'](false);
    expect(await p).toBe(false);
    expect(c['formulario'].getRawValue().motivo).toBe('Reposición');
    const q = c.puedeSalir();
    c['resolverCierre'](true);
    expect(await q).toBe(true);
  });
  it('limpia datos privados cuando se pierde la sesión', async () => {
    await montar();
    await seleccionar();
    perfil.set(null);
    f.detectChanges();
    expect(c['seleccion']()).toBeNull();
    expect(c['formulario'].getRawValue().motivo).toBe('');
    expect(c.puedeSalir()).toBe(true);
  });
  it('rechaza confirmación mientras consulta saldos', async () => {
    await montar();
    await seleccionar();
    c['consultando'].set(true);
    c['revisar']();
    expect(c['etapa']()).toBe('editar');
  });
});
