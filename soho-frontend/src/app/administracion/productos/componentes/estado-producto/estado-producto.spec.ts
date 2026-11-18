import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EstadoProducto } from './estado-producto';
import { EdicionProductosApi, ErrorEdicionProducto } from '../../servicios/edicion-productos-api';
import { ProductosAdministracion } from '../../servicios/productos-administracion';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { fichaEdicionFixture } from '../../modelos/edicion-productos.fixtures';
import { productoEdicion } from '../../modelos/edicion-productos-api';
import { ID_PRODUCTO_PRUEBA } from '../../modelos/consulta-productos.fixtures';

describe('Archivo y restauración reales en Angular', () => {
  let f: ComponentFixture<EstadoProducto>, c: EstadoProducto;
  const perfil = signal<{ id: string; rol: string } | null>({ id: 'admin-a', rol: 'ADMIN' });
  const api = { detalle: vi.fn(), pendiente: vi.fn(), escribir: vi.fn(), recuperar: vi.fn() };
  const fuente = { actualizarInventario: vi.fn() };
  const ficha = (estado = 'publicado', version = 1) =>
    productoEdicion({ ...fichaEdicionFixture(version), estado });
  const solicitud = (accion: 'ARCHIVAR' | 'RESTAURAR' = 'ARCHIVAR') => ({
    productoId: ID_PRODUCTO_PRUEBA,
    accion,
  });
  async function montar(accion: 'ARCHIVAR' | 'RESTAURAR' = 'ARCHIVAR', abierto = true) {
    TestBed.configureTestingModule({
      imports: [EstadoProducto],
      providers: [
        { provide: Cuenta, useValue: { perfil } },
        { provide: EdicionProductosApi, useValue: api },
        { provide: ProductosAdministracion, useValue: fuente },
      ],
    });
    f = TestBed.createComponent(EstadoProducto);
    c = f.componentInstance;
    if (abierto) f.componentRef.setInput('solicitud', solicitud(accion));
    await f.whenStable();
    f.detectChanges();
    await f.whenStable();
  }
  beforeEach(() => {
    vi.resetAllMocks();
    perfil.set({ id: 'admin-a', rol: 'ADMIN' });
    api.detalle.mockResolvedValue(ficha());
    api.pendiente.mockReturnValue(null);
    fuente.actualizarInventario.mockResolvedValue(true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value() {
        this.open = false;
      },
    });
  });
  afterEach(() => {
    f?.destroy();
    TestBed.resetTestingModule();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  it('consulta la ficha vigente y no escribe antes de confirmar', async () => {
    api.detalle.mockResolvedValue(ficha('publicado', 4));
    await montar();
    expect(c['ficha']()?.version).toBe(4);
    expect(api.escribir).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('SKU');
    expect(f.nativeElement.textContent).toContain('pedidos existentes');
  });
  it('confirma archivo con su versión actual y recarga antes de notificar', async () => {
    await montar();
    const evento = vi.spyOn(c.completado, 'emit');
    api.escribir.mockResolvedValue(ficha('archivado', 2));
    await c['confirmar']();
    expect(api.escribir).toHaveBeenCalledWith('ARCHIVAR', ID_PRODUCTO_PRUEBA, 1, {});
    expect(fuente.actualizarInventario).toHaveBeenCalledWith(ID_PRODUCTO_PRUEBA);
    expect(evento).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'archivado', tipo: 'ARCHIVAR' }),
    );
  });
  it('restaura solo tras confirmación y lo comunica como borrador', async () => {
    api.detalle.mockResolvedValue(ficha('archivado'));
    await montar('RESTAURAR');
    expect(api.escribir).not.toHaveBeenCalled();
    api.escribir.mockResolvedValue(ficha('borrador', 2));
    await c['confirmar']();
    expect(api.escribir).toHaveBeenCalledWith('RESTAURAR', ID_PRODUCTO_PRUEBA, 1, {});
    expect(c['confirmado']()?.producto.estado).toBe('borrador');
  });
  it('impide doble confirmación mientras espera el POST', async () => {
    await montar();
    let resolver!: (v: ReturnType<typeof ficha>) => void;
    api.escribir.mockImplementation(() => new Promise((r) => (resolver = r)));
    const a = c['confirmar']();
    await c['confirmar']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    expect(c.puedeSalir()).toBe(false);
    resolver(ficha('archivado', 2));
    await a;
  });
  it('un conflicto exige actualización explícita antes de volver a confirmar', async () => {
    await montar();
    api.escribir.mockRejectedValueOnce(new ErrorEdicionProducto('Cambió', 409));
    await c['confirmar']();
    expect(c['conflicto']()).toBe(true);
    await c['confirmar']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    api.detalle.mockResolvedValue(ficha('publicado', 3));
    await c['actualizar']();
    api.escribir.mockResolvedValue(ficha('archivado', 4));
    await c['confirmar']();
    expect(api.escribir).toHaveBeenLastCalledWith('ARCHIVAR', ID_PRODUCTO_PRUEBA, 3, {});
  });
  it('si falla el resumen después del éxito, reintenta consultas sin otro POST', async () => {
    await montar();
    api.escribir.mockResolvedValue(ficha('archivado', 2));
    fuente.actualizarInventario.mockResolvedValueOnce(false);
    const evento = vi.spyOn(c.completado, 'emit');
    await c['confirmar']();
    expect(c['confirmado']()).not.toBeNull();
    expect(evento).not.toHaveBeenCalled();
    await c['confirmar']();
    await c['actualizarConsultas']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    expect(evento).toHaveBeenCalledTimes(1);
  });
  it('recupera la solicitud anterior sin inferir otra acción por la fila seleccionada', async () => {
    api.pendiente.mockReturnValue({ tipo: 'ACTUALIZAR', productoId: ID_PRODUCTO_PRUEBA });
    await montar();
    api.recuperar.mockResolvedValue(ficha('publicado', 2));
    const evento = vi.spyOn(c.completado, 'emit');
    await c['confirmar']();
    expect(api.escribir).not.toHaveBeenCalled();
    await c['recuperar']();
    expect(api.recuperar).toHaveBeenCalledWith(false);
    expect(evento).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'ACTUALIZAR', estado: 'publicado' }),
    );
  });
  it('un registro dañado bloquea reenvíos pero permite una consulta asistida', async () => {
    api.pendiente.mockImplementation(() => {
      throw new ErrorEdicionProducto('Registro dañado', 0, true);
    });
    await montar();
    expect(c['pendiente']()).toBe(true);
    expect(c['reintentoDisponible']()).toBe(false);
    await c['recuperar'](true);
    expect(api.recuperar).not.toHaveBeenCalled();
    api.recuperar.mockResolvedValue(ficha('archivado', 2));
    await c['recuperar']();
    expect(api.escribir).not.toHaveBeenCalled();
    expect(api.recuperar).toHaveBeenCalledWith(false);
  });
  it('avisa antes de cerrar o navegar con una solicitud pendiente y conserva su recuperación', async () => {
    api.pendiente.mockReturnValue({ tipo: 'ARCHIVAR', productoId: ID_PRODUCTO_PRUEBA });
    await montar();
    const cerrar = vi.spyOn(c.cerrado, 'emit');
    c['cerrar']();
    expect(c['salir']()).toBe(true);
    expect(cerrar).not.toHaveBeenCalled();
    c['decidirSalida'](false);
    const salida = c.puedeSalir();
    c['decidirSalida'](true);
    expect(await salida).toBe(true);
    expect(c['pendiente']()).toBe(true);
  });
  it('ofrece recuperación al regresar al listado aunque no haya un diálogo abierto', async () => {
    api.pendiente.mockReturnValue({ tipo: 'ARCHIVAR', productoId: ID_PRODUCTO_PRUEBA });
    await montar('ARCHIVAR', false);
    expect(f.nativeElement.textContent).toContain('Resolver operación pendiente');
    expect(api.detalle).not.toHaveBeenCalled();
    const evento = vi.spyOn(c.retomar, 'emit');
    (f.nativeElement.querySelector('.aviso-pendiente button') as HTMLButtonElement).click();
    expect(evento).toHaveBeenCalledTimes(1);
  });
  it('una fila antigua no autoriza archivar un producto que ya está archivado', async () => {
    api.detalle.mockResolvedValue(ficha('archivado'));
    await montar();
    await c['confirmar']();
    expect(api.escribir).not.toHaveBeenCalled();
    expect(c['conflicto']()).toBe(true);
  });
  it('no incorpora una respuesta tardía después de perder el rol ADMIN', async () => {
    let resolver!: (v: ReturnType<typeof ficha>) => void;
    api.detalle.mockImplementation(() => new Promise((r) => (resolver = r)));
    TestBed.configureTestingModule({
      imports: [EstadoProducto],
      providers: [
        { provide: Cuenta, useValue: { perfil } },
        { provide: EdicionProductosApi, useValue: api },
        { provide: ProductosAdministracion, useValue: fuente },
      ],
    });
    f = TestBed.createComponent(EstadoProducto);
    c = f.componentInstance;
    f.componentRef.setInput('solicitud', solicitud());
    f.detectChanges();
    perfil.set(null);
    f.detectChanges();
    resolver(ficha());
    await f.whenStable();
    expect(c['ficha']()).toBeNull();
    expect(c.puedeSalir()).toBe(true);
  });
  it('un fallo inicial permite volver a consultar sin escribir', async () => {
    api.detalle.mockRejectedValueOnce(new ErrorEdicionProducto('Sin conexión'));
    await montar();
    expect(c['ficha']()).toBeNull();
    expect(c['error']()).toContain('Sin conexión');
    await c['actualizar']();
    expect(c['ficha']()).not.toBeNull();
    expect(api.escribir).not.toHaveBeenCalled();
  });
});
