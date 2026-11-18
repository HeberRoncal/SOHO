import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PerfilCuenta } from './perfil-cuenta';
import { provideRouter } from '@angular/router';
import { Cuenta } from '../../servicios/cuenta';
import { VincularGoogle } from '../vincular-google/vincular-google';
import { ResultadoCuenta } from '../../modelos/cuenta';

@Component({ selector: 'app-vincular-google', template: '' })
class VinculoPrueba {}

describe('Formulario de datos personales', () => {
  const original = {
    id: 'cliente',
    nombres: 'Ana',
    apellidos: 'Prueba',
    correo: 'ana@soho.test',
    celular: '',
    verificado: true,
    proveedor: 'correo' as const,
    rol: 'CLIENTE' as const,
  };
  let perfil: ReturnType<typeof signal<typeof original>>;
  let guardar: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    perfil = signal({ ...original });
    guardar = vi.fn(async (datos: typeof original) => {
      perfil.update((p) => ({
        ...p,
        nombres: datos.nombres.trim(),
        apellidos: datos.apellidos.trim(),
      }));
      return { correcto: true, mensaje: 'Tus datos se actualizaron correctamente.' };
    });
    TestBed.configureTestingModule({
      imports: [PerfilCuenta],
      providers: [
        provideRouter([]),
        { provide: Cuenta, useValue: { remoto: true, perfil, guardarPerfil: guardar } },
      ],
    }).overrideComponent(PerfilCuenta, {
      remove: { imports: [VincularGoogle] },
      add: { imports: [VinculoPrueba] },
    });
  });
  const montar = () => {
    const f = TestBed.createComponent(PerfilCuenta);
    f.detectChanges();
    return f;
  };
  const escribir = (host: HTMLElement, campo: string, valor: string) => {
    const e = host.querySelector<HTMLInputElement>('#perfil-' + campo)!;
    e.value = valor;
    e.dispatchEvent(new Event('input', { bubbles: true }));
  };
  it('precarga el perfil, mantiene el correo de lectura y no ofrece celular sin persistencia', () => {
    const f = montar(),
      host = f.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLInputElement>('#perfil-nombres')?.value).toBe('Ana');
    expect(host.querySelector<HTMLInputElement>('#perfil-correo')?.readOnly).toBe(true);
    expect(host.querySelector('#perfil-celular')).toBeNull();
  });
  it('valida antes de enviar y enfoca el campo inválido', () => {
    const f = montar(),
      host = f.nativeElement as HTMLElement;
    escribir(host, 'nombres', 'A');
    host.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    f.detectChanges();
    expect(guardar).not.toHaveBeenCalled();
    expect(host.querySelector('#perfil-nombres-mensaje')?.textContent).toContain('2 y 80');
    expect(document.activeElement?.id).toBe('perfil-nombres');
  });
  it('guarda, muestra confirmación y limpia el aviso al editar de nuevo', async () => {
    const f = montar(),
      host = f.nativeElement as HTMLElement;
    escribir(host, 'nombres', ' María José ');
    host.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await f.whenStable();
    expect(host.querySelector('[role=status]')?.textContent).toContain('actualizaron');
    expect(host.querySelector<HTMLInputElement>('#perfil-nombres')?.value).toBe('María José');
    escribir(host, 'apellidos', 'Otro');
    f.detectChanges();
    expect(host.querySelector('[data-resultado-perfil]')).toBeNull();
  });
  it('bloquea duplicados y conserva el borrador ante un error para reintentar', async () => {
    let completar!: (r: ResultadoCuenta) => void;
    guardar.mockImplementation(
      () =>
        new Promise<ResultadoCuenta>((r) => {
          completar = r;
        }),
    );
    const f = montar(),
      host = f.nativeElement as HTMLElement;
    escribir(host, 'nombres', 'Borrador');
    const b = host.querySelector<HTMLButtonElement>('button[type=submit]')!;
    b.click();
    b.click();
    f.detectChanges();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('#perfil-nombres')?.disabled).toBe(true);
    completar({ correcto: false, mensaje: 'No pudimos guardar tus datos.' });
    await vi.waitFor(() => {
      f.detectChanges();
      expect(b.disabled).toBe(false);
    });
    expect(host.querySelector('[role=alert]')?.textContent).toContain('No pudimos');
    expect(host.querySelector<HTMLInputElement>('#perfil-nombres')?.value).toBe('Borrador');
    expect(perfil().nombres).toBe('Ana');
  });
  it('ignora el resultado cuando se abandona la vista durante el guardado', async () => {
    let completar!: (r: ResultadoCuenta) => void;
    guardar.mockImplementation(
      () =>
        new Promise<ResultadoCuenta>((r) => {
          completar = r;
        }),
    );
    const f = montar();
    f.nativeElement.querySelector('button[type=submit]').click();
    f.destroy();
    completar({ correcto: true, mensaje: 'Resultado tardío' });
    await Promise.resolve();
    expect(f.nativeElement.textContent).not.toContain('Resultado tardío');
  });
});
