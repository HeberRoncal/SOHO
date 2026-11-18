import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { Pagos } from './pagos';
import { ConfiguracionPagosApi } from './servicios/configuracion-pagos-api';
import {
  ADMIN_PAGOS,
  consultaPagosFixture,
  publicacionPagosFixture,
  qrPagosFixture,
  archivoPagosFixture,
} from './modelos/configuracion-pagos.fixtures';

describe('Pagos: desactivar, editar y guardar directamente', () => {
  let f: ComponentFixture<Pagos>, http: HttpTestingController, estado: ConfiguracionPagosApi;
  const perfil = signal<{ id: string; rol: string } | null>(null),
    ruta = '/api/admin/configuracion/pagos';
  beforeEach(async () => {
    sessionStorage.clear();
    perfil.set({ id: ADMIN_PAGOS, rol: 'ADMIN' });
    TestBed.configureTestingModule({
      imports: [Pagos],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion: signal('autenticado') } },
      ],
    });
    f = TestBed.createComponent(Pagos);
    http = TestBed.inject(HttpTestingController);
    estado = TestBed.inject(ConfiguracionPagosApi);
    f.detectChanges();
    http.expectOne(ruta).flush(consultaPagosFixture());
    await f.whenStable();
    f.detectChanges();
  });
  afterEach(() => {
    http.verify();
    f.destroy();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });
  const host = () => f.nativeElement as HTMLElement;
  function editar() {
    estado.campo('YAPE', 'celular', '987654321');
    estado.campo('YAPE', 'titular', 'SOHO pruebas');
    f.detectChanges();
  }
  async function completar(p: Promise<void>, r: ReturnType<HttpTestingController['expectOne']>) {
    const resultado = publicacionPagosFixture(r.request.body);
    r.flush(resultado);
    await Promise.resolve();
    const lectura = await vi.waitFor(() => http.expectOne(ruta));
    lectura.flush({ ...consultaPagosFixture(), configuracion: resultado.configuracion });
    await p;
    f.detectChanges();
    return resultado;
  }
  it('presenta dos métodos desactivados sin borradores ni publicación', () => {
    expect(host().querySelectorAll('[role="switch"][aria-checked="false"]')).toHaveLength(2);
    expect((host().querySelector('#yape-celular') as HTMLInputElement).disabled).toBe(false);
    expect(host().textContent).not.toMatch(/borrador|publicar/i);
    expect(host().querySelector('dialog')).toBeNull();
  });
  it('guarda los datos desactivados directamente sin diálogo ni activarlos', async () => {
    editar();
    const p = f.componentInstance['guardar'](),
      r = http.expectOne(ruta);
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body.metodos.every((m: { activo: boolean }) => !m.activo)).toBe(true);
    expect(host().querySelector('dialog')).toBeNull();
    await completar(p, r);
    expect(estado.cambios()).toBe(false);
    expect(estado.publicacion()).toBeNull();
    expect(estado.actual()?.metodos[0].titular).toBe('SOHO pruebas');
  });
  it('activar guarda y bloquea datos y QR hasta una desactivación confirmada', async () => {
    editar();
    let p = f.componentInstance['guardar']('YAPE', true),
      r = http.expectOne(ruta);
    await completar(p, r);
    expect((host().querySelector('#yape-celular') as HTMLInputElement).disabled).toBe(true);
    expect((host().querySelector('#yape-archivo-qr') as HTMLInputElement).disabled).toBe(true);
    estado.campo('YAPE', 'titular', 'Cambio indebido');
    expect(estado.borrador()[0].titular).toBe('SOHO pruebas');
    p = f.componentInstance['guardar']('YAPE', false);
    r = http.expectOne(ruta);
    f.detectChanges();
    expect(r.request.body.metodos[0]).toMatchObject({
      activo: false,
      celular: '987654321',
      titular: 'SOHO pruebas',
    });
    expect((host().querySelector('#yape-celular') as HTMLInputElement).disabled).toBe(true);
    await completar(p, r);
    expect((host().querySelector('#yape-celular') as HTMLInputElement).disabled).toBe(false);
  });
  it('no activa un método sin celular y titular', async () => {
    await f.componentInstance['guardar']('YAPE', true);
    f.detectChanges();
    http.expectNone((r) => r.method === 'PATCH');
    expect(estado.actual()?.metodos[0].activo).toBe(false);
    expect(host().querySelector('[role="alert"]')).not.toBeNull();
  });
  it('el QR se usa y guarda al subirlo mientras el método está desactivado', async () => {
    const e = { target: { files: [archivoPagosFixture()], value: 'qr.png' } } as unknown as Event;
    const p = f.componentInstance['cargar'](e, 'YAPE');
    const carga = await vi.waitFor(() => http.expectOne(ruta + '/qr'));
    carga.flush({ archivo: qrPagosFixture() }, { status: 201, statusText: 'Created' });
    const guardado = await vi.waitFor(() => http.expectOne(ruta));
    expect(guardado.request.body.metodos[0]).toMatchObject({
      activo: false,
      qrId: qrPagosFixture().id,
    });
    await completar(p, guardado);
    expect(estado.actual()?.metodos[0].qr?.id).toBe(qrPagosFixture().id);
    expect(estado.carga('YAPE')).toBeUndefined();
    expect(estado.cambios()).toBe(false);
    expect(host().textContent).not.toMatch(/borrador|publicar|Usar este QR/i);
  });
  it('un resultado incierto conserva el método bloqueado y recupera la misma operación', async () => {
    editar();
    let p = f.componentInstance['guardar']('YAPE', true),
      r = http.expectOne(ruta);
    const cuerpo = r.request.body;
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    f.detectChanges();
    expect(host().textContent).toContain('Guardado por confirmar');
    expect(estado.editable('YAPE')).toBe(false);
    await f.whenStable();
    f.detectChanges();
    expect((host().querySelector('#yape-celular') as HTMLInputElement).disabled).toBe(true);
    p = f.componentInstance['recuperarGuardado']();
    r = http.expectOne(ruta + '/operaciones/' + cuerpo.claveSolicitud);
    r.flush(publicacionPagosFixture(cuerpo));
    await Promise.resolve();
    (await vi.waitFor(() => http.expectOne(ruta))).flush({
      ...consultaPagosFixture(),
      configuracion: publicacionPagosFixture(cuerpo).configuracion,
    });
    await p;
    expect(estado.publicacion()).toBeNull();
    expect(estado.actual()?.metodos[0].activo).toBe(true);
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('conserva los cambios de la otra billetera al guardar o activar una sola', async () => {
    editar();
    estado.campo('PLIN', 'titular', 'Pendiente Plin');
    const p = f.componentInstance['guardar']('YAPE', true),
      r = http.expectOne(ruta);
    expect(r.request.body.metodos[1].titular).toBeNull();
    await completar(p, r);
    expect(estado.borrador()[1].titular).toBe('Pendiente Plin');
    expect(estado.cambios()).toBe(true);
  });
  it('protege cambios sin guardar y descarta solo por decisión explícita', () => {
    editar();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(f.componentInstance.puedeSalir()).toBe(false);
    f.componentInstance['descartar']();
    expect(estado.cambios()).toBe(true);
    vi.mocked(window.confirm).mockReturnValue(true);
    f.componentInstance['descartar']();
    expect(estado.cambios()).toBe(false);
  });
  it('retira los campos al perder ADMIN', async () => {
    editar();
    perfil.set(null);
    TestBed.tick();
    f.detectChanges();
    expect(host().querySelector('#yape-celular')).toBeNull();
    expect(host().querySelector('.config-preview')).toBeNull();
  });
});
