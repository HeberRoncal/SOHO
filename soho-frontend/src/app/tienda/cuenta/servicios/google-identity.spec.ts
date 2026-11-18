import { TestBed } from '@angular/core/testing';
import { GoogleIdentity } from './google-identity';
import { GoogleIdApi } from '../modelos/google';

describe('Botón oficial de Google', () => {
  const ventana = window as Window & { google?: { accounts: { id: GoogleIdApi } } };
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete ventana.google;
    document
      .querySelectorAll('script[src="https://accounts.google.com/gsi/client"]')
      .forEach((e) => e.remove());
  });
  it('comparte la descarga del SDK y permite reintentar si falla', async () => {
    const servicio = TestBed.inject(GoogleIdentity);
    const primera = servicio.cargar();
    const rechazo = expect(primera).rejects.toThrow();
    expect(servicio.cargar()).toBe(primera);
    document
      .querySelector('script[src="https://accounts.google.com/gsi/client"]')!
      .dispatchEvent(new Event('error'));
    await rechazo;
    const segunda = servicio.cargar();
    const sdk: GoogleIdApi = { initialize: vi.fn(), renderButton: vi.fn() };
    ventana.google = { accounts: { id: sdk } };
    document
      .querySelector('script[src="https://accounts.google.com/gsi/client"]')!
      .dispatchEvent(new Event('load'));
    expect(await segunda).toBe(sdk);
  });
  it('asocia client ID y nonce, usa el botón oficial e ignora respuestas de una vista anterior', async () => {
    const inicializar = vi.fn<GoogleIdApi['initialize']>();
    const dibujar = vi.fn<GoogleIdApi['renderButton']>();
    ventana.google = { accounts: { id: { initialize: inicializar, renderButton: dibujar } } };
    const servicio = TestBed.inject(GoogleIdentity);
    const recibir = vi.fn();
    const desafio = { clientId: 'cliente', nonce: 'nonce-1', expiraEn: new Date().toISOString() };
    const liberar = await servicio.montar(document.createElement('div'), desafio, recibir);
    const anterior = inicializar.mock.calls[0][0];
    expect(anterior).toMatchObject({
      client_id: 'cliente',
      nonce: 'nonce-1',
      auto_select: false,
      ux_mode: 'popup',
    });
    expect(dibujar.mock.calls[0][1]).toMatchObject({
      text: 'continue_with',
      locale: 'es',
      width: 320,
    });
    const actual = vi.fn();
    const liberarActual = await servicio.montar(
      document.createElement('div'),
      { ...desafio, nonce: 'nonce-2' },
      actual,
    );
    anterior.callback({ credential: 'vieja' });
    expect(recibir).not.toHaveBeenCalled();
    const config = inicializar.mock.calls[1][0];
    config.callback({ credential: 'incorrecta', state: 'nonce-1' });
    expect(actual).not.toHaveBeenCalled();
    config.callback({ credential: 'correcta', state: 'nonce-2' });
    expect(actual).toHaveBeenCalledWith('correcta');
    liberar();
    liberarActual();
    config.callback({ credential: 'tardia' });
    expect(actual).toHaveBeenCalledTimes(1);
  });
  it('espera a que desaparezca el provisional aunque el iframe ya tenga tamaño', async () => {
    const elemento = document.createElement('div');
    const provisional = document.createElement('div');
    provisional.setAttribute('role', 'button');
    vi.spyOn(provisional, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 320, 40),
    ] as unknown as DOMRectList);
    const marco = document.createElement('iframe');
    vi.spyOn(marco, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 44));
    ventana.google = {
      accounts: { id: { initialize: vi.fn(), renderButton: (e) => e.append(provisional, marco) } },
    };
    const estado = vi.fn();
    const liberar = await TestBed.inject(GoogleIdentity).montar(
      elemento,
      { clientId: 'cliente', nonce: 'nonce', expiraEn: 'futuro' },
      vi.fn(),
      estado,
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(estado.mock.calls).toEqual([['cargando']]);
    expect(elemento.style.opacity).toBe('0');
    provisional.remove();
    await vi.waitFor(() => expect(estado).toHaveBeenLastCalledWith('listo'));
    expect(elemento.style.opacity).toBe('');
    liberar();
    expect(elemento.childElementCount).toBe(0);
  });
  it('libera un montaje que no termina y permite un nuevo intento', async () => {
    vi.useFakeTimers();
    const dibujar = vi.fn<GoogleIdApi['renderButton']>();
    ventana.google = { accounts: { id: { initialize: vi.fn(), renderButton: dibujar } } };
    const servicio = TestBed.inject(GoogleIdentity);
    const elemento = document.createElement('div');
    const desafio = { clientId: 'cliente', nonce: 'nonce', expiraEn: 'futuro' };
    const estado = vi.fn();
    const liberar = await servicio.montar(elemento, desafio, vi.fn(), estado);
    await vi.advanceTimersByTimeAsync(10001);
    expect(estado.mock.calls).toEqual([['cargando'], ['error']]);
    const reintento = await servicio.montar(elemento, desafio, vi.fn(), estado);
    expect(dibujar).toHaveBeenCalledTimes(2);
    expect(estado).toHaveBeenLastCalledWith('cargando');
    liberar();
    reintento();
    await vi.advanceTimersByTimeAsync(10001);
    expect(estado.mock.calls.filter(([e]) => e === 'error')).toHaveLength(1);
  });
});
