import { TestBed } from '@angular/core/testing';
import { BotonGoogle } from './boton-google';
import { GoogleCuentaApi } from '../../servicios/google-cuenta-api';
import { GoogleIdentity } from '../../servicios/google-identity';
import { ResultadoGoogle } from '../../modelos/google';

describe('Acceso Google y recuperación del formulario', () => {
  let callback: (valor: string) => void;
  const api = { configuracion: vi.fn(), desafio: vi.fn(), ingresar: vi.fn(), vincular: vi.fn() };
  const liberar = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    api.configuracion.mockResolvedValue({ habilitado: true, clientId: 'cliente' });
    api.desafio.mockResolvedValue({ clientId: 'cliente', nonce: 'nonce', expiraEn: 'futuro' });
    TestBed.configureTestingModule({
      imports: [BotonGoogle],
      providers: [
        { provide: GoogleCuentaApi, useValue: api },
        {
          provide: GoogleIdentity,
          useValue: {
            montar: async (
              _elemento: HTMLElement,
              _desafio: unknown,
              recibir: (valor: string) => void,
              informar: (estado: 'cargando' | 'listo' | 'error') => void,
            ) => {
              callback = recibir;
              informar('listo');
              return liberar;
            },
          },
        },
      ],
    });
  });
  const montar = async () => {
    const f = TestBed.createComponent(BotonGoogle);
    f.detectChanges();
    await f.whenStable();
    return f;
  };
  it('no bloquea el acceso por correo cuando el usuario cancela la ventana de Google', async () => {
    const f = await montar();
    const ocupado = vi.fn();
    f.componentInstance.ocupado.subscribe(ocupado);
    expect(ocupado).not.toHaveBeenCalled();
    expect(api.ingresar).not.toHaveBeenCalled();
    f.destroy();
    callback('tardia');
    expect(api.ingresar).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(liberar).toHaveBeenCalled());
  });
  it('bloquea los envíos duplicados y libera el formulario después de un error', async () => {
    const f = await montar();
    let resolver!: (r: ResultadoGoogle) => void;
    api.ingresar.mockImplementation(
      () =>
        new Promise<ResultadoGoogle>((r) => {
          resolver = r;
        }),
    );
    const ocupado = vi.fn();
    f.componentInstance.ocupado.subscribe(ocupado);
    callback('credencial');
    callback('duplicada');
    expect(api.ingresar).toHaveBeenCalledTimes(1);
    resolver({ tipo: 'error', mensaje: 'Inténtalo nuevamente.' });
    await f.whenStable();
    expect(ocupado.mock.calls).toEqual([[true], [false]]);
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('Inténtalo');
    f.nativeElement.querySelector('button').click();
    await f.whenStable();
    expect(api.desafio).toHaveBeenCalledTimes(2);
  });
  it('solicita apellidos faltantes y continúa solo al confirmar datos válidos', async () => {
    api.ingresar
      .mockResolvedValueOnce({
        tipo: 'completar',
        perfil: { nombres: 'Ana', apellidos: '', correo: 'ana@gmail.com' },
      })
      .mockResolvedValueOnce({ tipo: 'correcto' });
    const f = await montar();
    const acceso = vi.fn();
    f.componentInstance.acceso.subscribe(acceso);
    callback('credencial');
    await f.whenStable();
    const form = f.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await f.whenStable();
    expect(api.ingresar).toHaveBeenCalledTimes(1);
    const input = f.nativeElement.querySelector('#google-apellidos') as HTMLInputElement;
    input.value = 'Prueba';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await f.whenStable();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await f.whenStable();
    expect(api.ingresar).toHaveBeenLastCalledWith('credencial', {
      nombres: 'Ana',
      apellidos: 'Prueba',
    });
    expect(acceso).toHaveBeenCalledTimes(1);
  });
});
