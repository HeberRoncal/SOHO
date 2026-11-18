import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DetalleSolicitud } from './detalle-solicitud';
import { SolicitudesAdministracion } from '../../servicios/solicitudes-administracion';

describe('Formulario de nota interna de una solicitud', () => {
  it('intercepta el envío nativo, valida el texto y guarda sin recargar el caso', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/cambios/:identificador', component: DetalleSolicitud }]),
      ],
    });
    const navegador = await RouterTestingHarness.create('/admin/cambios/CD-000002');
    const formulario = navegador.routeNativeElement!.querySelector<HTMLFormElement>('.notas form')!;
    const invalido = new Event('submit', { bubbles: true, cancelable: true });
    formulario.dispatchEvent(invalido);
    await navegador.fixture.whenStable();
    expect(invalido.defaultPrevented).toBe(true);
    expect(navegador.routeNativeElement!.querySelector('#error-nota')!.textContent).toContain(
      '3 y 500',
    );
    const campo = formulario.querySelector<HTMLTextAreaElement>('textarea')!;
    campo.value = 'Nota de atención del caso ficticio.';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    const envio = new Event('submit', { bubbles: true, cancelable: true });
    formulario.dispatchEvent(envio);
    await navegador.fixture.whenStable();
    expect(envio.defaultPrevented).toBe(true);
    expect(TestBed.inject(SolicitudesAdministracion).obtener('CD-000002')!.notas[0].texto).toBe(
      'Nota de atención del caso ficticio.',
    );
    expect(campo.value).toBe('');
  });
});
