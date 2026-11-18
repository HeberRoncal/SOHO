import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Cuenta } from '../../servicios/cuenta';
import { EstadoVerificacion } from './estado-verificacion';

describe('Verificación en Mi cuenta', () => {
  it('una cuenta verificada no ofrece reenvío', () => {
    TestBed.configureTestingModule({
      imports: [EstadoVerificacion],
      providers: [
        {
          provide: Cuenta,
          useValue: { perfil: signal({ verificado: true }), reenviarVerificacion: vi.fn() },
        },
      ],
    });
    const f = TestBed.createComponent(EstadoVerificacion);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Correo verificado');
    expect(f.nativeElement.querySelector('button')).toBeNull();
  });
  it('evita envíos duplicados y distingue un fallo SMTP de una solicitud recibida', async () => {
    let completar!: (r: { correcto: boolean; mensaje: string }) => void;
    const reenviar = vi.fn(
      () =>
        new Promise((r) => {
          completar = r;
        }),
    );
    TestBed.configureTestingModule({
      imports: [EstadoVerificacion],
      providers: [
        {
          provide: Cuenta,
          useValue: { perfil: signal({ verificado: false }), reenviarVerificacion: reenviar },
        },
      ],
    });
    const f = TestBed.createComponent(EstadoVerificacion);
    f.detectChanges();
    const boton = f.nativeElement.querySelector('button') as HTMLButtonElement;
    boton.click();
    boton.click();
    expect(reenviar).toHaveBeenCalledTimes(1);
    completar({ correcto: false, mensaje: 'Correo no disponible' });
    await f.whenStable();
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('no disponible');
  });
});
