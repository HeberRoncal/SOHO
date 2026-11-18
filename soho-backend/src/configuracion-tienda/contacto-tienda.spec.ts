import { ConfiguracionTiendaService } from './configuracion-tienda.service.js';
import { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import { ContactoTiendaController } from './contacto-tienda.controller.js';
import { ES_PUBLICO } from '../autenticacion/seguridad/auth.decoradores.js';

describe('Contacto público de Tienda', () => {
  const crear = (configuracion: unknown) => {
    const findUnique = vi.fn().mockResolvedValue(configuracion);
    const escritura = {
      transaccion: async (f: (tx: unknown) => unknown) =>
        f({ configuracionTienda: { findUnique } }),
    };
    return new ConfiguracionTiendaService(
      escritura as unknown as EscrituraAutorizadaService,
    );
  };
  it('expone solo los tres datos de contacto de la versión vigente', async () => {
    const servicio = crear({
      versionActual: {
        correo: 'contacto@soho.test',
        whatsapp: '987654321',
        horario: 'Lunes a sábado',
        responsableId: 'privado',
        claveSolicitud: 'privada',
        solicitudHash: 'privado',
      },
    });
    expect(await servicio.consultarContacto()).toEqual({
      correo: 'contacto@soho.test',
      whatsapp: '987654321',
      horario: 'Lunes a sábado',
    });
  });
  it('no inventa contactos si aún no hay versión guardada', async () => {
    expect(await crear({ versionActual: null }).consultarContacto()).toEqual({
      correo: null,
      whatsapp: null,
      horario: null,
    });
  });
  it('distingue un fallo de configuración de un contacto vacío', async () => {
    await expect(crear(null).consultarContacto()).rejects.toThrow(
      'no está disponible',
    );
  });
  it('permite la consulta pública y rechaza parámetros inesperados', async () => {
    const servicio = crear({ versionActual: null });
    const controlador = new ContactoTiendaController(servicio);
    expect(Reflect.getMetadata(ES_PUBLICO, controlador.consultar)).toBe(true);
    expect(() => controlador.consultar({ responsable: true })).toThrow();
    expect(await controlador.consultar({})).toEqual({
      correo: null,
      whatsapp: null,
      horario: null,
    });
  });
});
