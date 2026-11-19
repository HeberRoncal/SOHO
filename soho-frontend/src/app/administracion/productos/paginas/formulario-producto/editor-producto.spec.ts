import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import esPE from '@angular/common/locales/es-PE';
import {
  MovimientosInventarioApi,
  ErrorMovimientoInventario,
} from '../../servicios/movimientos-inventario-api';
import { varianteMovimientoFixture } from '../../modelos/movimientos-inventario.fixtures';
import { EditorProducto } from './editor-producto';
import { EdicionProductosApi, ErrorEdicionProducto } from '../../servicios/edicion-productos-api';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { PerfilCuenta } from '../../../../tienda/cuenta/modelos/cuenta';
import {
  archivoEdicionFixture,
  fichaEdicionFixture,
  galeriaEdicionFixture,
  opcionesEdicionFixture,
  ID_ARCHIVO_EDICION,
  ID_GRUPO_EDICION,
} from '../../modelos/edicion-productos.fixtures';
import {
  galeriaProducto,
  opcionesEdicion,
  productoEdicion,
} from '../../modelos/edicion-productos-api';
import { ID_PRODUCTO_PRUEBA } from '../../modelos/consulta-productos.fixtures';
import { ProductosAdministracion } from '../../servicios/productos-administracion';

describe('Formulario real de borradores, fotografías y publicación', () => {
  beforeAll(() => registerLocaleData(esPE));
  let c: EditorProducto, f: ComponentFixture<EditorProducto>;
  const perfil = signal<PerfilCuenta | null>(null);
  const stockApi = { pendiente: vi.fn(), detalle: vi.fn(), registrar: vi.fn(), recuperar: vi.fn() };
  const api = {
    opciones: vi.fn(),
    detalle: vi.fn(),
    fotografias: vi.fn(),
    configuracion: vi.fn(),
    pendiente: vi.fn(),
    escribir: vi.fn(),
    recuperar: vi.fn(),
    subir: vi.fn(),
    carga: vi.fn(),
  };
  async function montar(id: string | null = ID_PRODUCTO_PRUEBA, antesDeCarga?: () => void) {
    const params = convertToParamMap(id ? { identificador: id } : {});
    TestBed.configureTestingModule({
      imports: [EditorProducto],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(params), snapshot: { paramMap: params } },
        },
        { provide: EdicionProductosApi, useValue: api },
        {
          provide: ProductosAdministracion,
          useValue: { actualizarInventario: vi.fn().mockResolvedValue(true) },
        },
        { provide: MovimientosInventarioApi, useValue: stockApi },
        { provide: Cuenta, useValue: { perfil } },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    f = TestBed.createComponent(EditorProducto);
    c = f.componentInstance;
    if (antesDeCarga) {
      f.detectChanges();
      antesDeCarga();
    }
    await f.whenStable();
    await Promise.resolve();
    f.detectChanges();
    await f.whenStable();
    for (const d of f.nativeElement.querySelectorAll('dialog') as HTMLDialogElement[]) {
      d.showModal = () => {
        d.open = true;
      };
      d.close = () => {
        d.open = false;
      };
    }
    for (const panel of f.nativeElement.querySelectorAll('section') as HTMLElement[])
      panel.scrollIntoView = vi.fn();
  }
  beforeEach(() => {
    perfil.set({
      id: 'admin-a',
      rol: 'ADMIN',
      nombres: 'Ana',
      apellidos: 'Prueba',
      correo: 'admin@soho.test',
      verificado: true,
      celular: '',
      proveedor: 'correo',
    });
    sessionStorage.clear();
    vi.resetAllMocks();
    api.opciones.mockResolvedValue(opcionesEdicion(opcionesEdicionFixture()));
    api.detalle.mockResolvedValue(productoEdicion(fichaEdicionFixture()));
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture()));
    api.configuracion.mockResolvedValue({
      configurada: true,
      maximoBytes: 5242880,
      maximoImagenes: 8,
    });
    api.pendiente.mockReturnValue(null);
    stockApi.pendiente.mockReturnValue(null);
  });
  afterEach(() => {
    f?.destroy();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });
  it('carga la versión, identidad y existencias reales; no admite cambiar identidades usadas', async () => {
    await montar();
    expect(c['ficha']()?.version).toBe(1);
    expect(c['formulario'].getRawValue().grupo).toBe(ID_GRUPO_EDICION);
    expect(c['identidadFija']()).toBe(true);
    expect(f.nativeElement.textContent).toContain('NK-AF107-NG-40');
    expect(c['ficha']()?.producto.variantes[0].existencias).toBe(5);
    expect(c['cambios']()).toBe(false);
  });
  it('muestra la marca seleccionada aparte y guarda el nombre sin añadirle la marca', async () => {
    await montar(null);
    const marca = c['opciones']().marcas[0];
    c['formulario'].patchValue({
      marcaId: marca.id,
      nombre: 'Air Force 1',
      modelo: 'Air Force 1',
      codigoModelo: 'AF107',
    });
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.marca-seleccionada').textContent.trim()).toBe(
      marca.nombre,
    );
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture()));
    await c['guardarDatos']();
    expect(api.escribir.mock.calls[0][3].nombre).toBe('Air Force 1');
  });
  it('un producto nuevo espera el código del servidor y no envía stock ni SKU', async () => {
    await montar(null);
    expect(f.nativeElement.querySelector('#sec-precio')).toBeNull();
    expect(f.nativeElement.querySelector('#sec-variantes')).toBeNull();
    expect(f.nativeElement.querySelector('#sec-fotos')).toBeNull();
    expect(f.nativeElement.querySelector('#sec-publicacion')).toBeNull();
    expect(f.nativeElement.querySelector('.barra-guardar').textContent).toContain('Crear borrador');
    expect(f.nativeElement.textContent).not.toContain('SHO-0002');
    c['formulario'].patchValue({ nombre: 'Nuevo' });
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture()));
    await c['guardarDatos']();
    expect(api.escribir).toHaveBeenCalledWith(
      'CREAR',
      null,
      null,
      expect.objectContaining({ nombre: 'Nuevo', grupoModelo: null, color: null }),
    );
    const datos = api.escribir.mock.calls[0][3];
    expect(datos).not.toHaveProperty('codigoInterno');
    expect(datos).not.toHaveProperty('sku');
    expect(datos).not.toHaveProperty('existencias');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/admin/productos', ID_PRODUCTO_PRUEBA, 'editar'],
      { replaceUrl: true },
    );
    f.detectChanges();
    expect(f.nativeElement.querySelector('#sec-precio')).toBeTruthy();
    expect(f.nativeElement.querySelector('#sec-variantes')).toBeTruthy();
    expect(f.nativeElement.querySelector('#sec-fotos')).toBeTruthy();
    expect(f.nativeElement.querySelector('.barra-guardar').textContent).toContain('Continuar');
    expect(f.nativeElement.querySelector('.opciones-avanzadas')).toBeNull();
  });
  it('elegir un modelo existente completa su identidad y oculta campos duplicados', async () => {
    await montar(null);
    c['formulario'].patchValue({ grupo: ID_GRUPO_EDICION });
    c['seleccionarGrupo']();
    f.detectChanges();
    expect(c['formulario'].getRawValue().codigoModelo).toBe('AF107');
    expect(f.nativeElement.querySelector('[formControlName="codigoModelo"]')).toBeNull();
    expect(f.nativeElement.querySelector('[formControlName="marcaId"]')).toBeNull();
    c['formulario'].patchValue({ grupo: '' });
    f.detectChanges();
    expect(f.nativeElement.querySelector('[formControlName="codigoModelo"]')).toBeTruthy();
  });
  function editarCantidad(valor: string, talla = c['ficha']()!.producto.variantes[0].talla) {
    c['cambiarStock'](talla, { target: { value: valor } } as unknown as Event);
  }
  function inventarioActual() {
    const f = c['ficha']()!,
      v = f.producto.variantes[0];
    return {
      ...varianteMovimientoFixture(),
      id: v.identificador,
      sku: v.sku,
      talla: v.talla,
      producto: { ...varianteMovimientoFixture().producto, id: f.producto.identificador },
      existencias: v.existencias,
      cantidadReservada: v.cantidadReservada,
      habilitada: v.habilitada,
    };
  }
  it('guarda la cantidad total como un ajuste autom?tico y no repite al guardar otra vez', async () => {
    await montar();
    const actual = inventarioActual();
    stockApi.detalle.mockResolvedValue(actual);
    stockApi.registrar.mockResolvedValue({ actual: { ...actual, existencias: 12 } });
    editarCantidad('12');
    expect(c['cambios']()).toBe(true);
    await c['guardarCambios']();
    expect(stockApi.registrar).toHaveBeenCalledWith(
      actual,
      expect.objectContaining({
        tipo: 'ajuste',
        sentido: 'sumar',
        cantidad: String(12 - actual.existencias),
      }),
    );
    expect(c['ficha']()!.producto.variantes[0].existencias).toBe(12);
    expect(c['cambios']()).toBe(false);
    await c['guardarCambios']();
    expect(stockApi.registrar).toHaveBeenCalledTimes(1);
    expect(api.escribir).not.toHaveBeenCalled();
  });
  it.each(['', '-1', '1.5', '100000'])(
    'rechaza cantidades inv?lidas antes de guardar: %s',
    async (valor) => {
      await montar();
      editarCantidad(valor);
      c['formulario'].patchValue({ nombre: 'Cambio' });
      await c['guardarCambios']();
      expect(stockApi.registrar).not.toHaveBeenCalled();
      expect(api.escribir).not.toHaveBeenCalled();
      expect(c['error']()).toContain('stock entero');
    },
  );
  it('rechaza reducir el stock por debajo de lo reservado', async () => {
    await montar();
    const v = c['ficha']()!.producto.variantes[0];
    c['ficha'].update((f) => ({
      ...f!,
      producto: { ...f!.producto, variantes: [{ ...v, cantidadReservada: 3 }] },
    }));
    editarCantidad('2');
    await c['guardarCambios']();
    expect(stockApi.registrar).not.toHaveBeenCalled();
    expect(c['error']()).toContain('3 a 99,999');
  });
  it('muestra el stock de cada talla nueva en una tabla, no junto a su selector', async () => {
    await montar();
    c['elegirTalla']('41', { target: { checked: true } } as unknown as Event);
    f.detectChanges();

    const selector = f.nativeElement.querySelector('.seleccion-tallas') as HTMLElement;
    const tabla = f.nativeElement.querySelector('.tabla-tallas-nuevas') as HTMLElement;
    expect(selector.querySelector('input[type="number"]')).toBeNull();
    expect(tabla.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(Array.from(tabla.querySelectorAll('th')).map((th) => th.textContent.trim())).toEqual([
      'Sistema',
      'Talla',
      'SKU',
      'Stock físico',
    ]);
    expect(tabla.textContent).toContain('Se genera al guardar');

    const stock = tabla.querySelector('input[type="number"]') as HTMLInputElement;
    expect(stock.getAttribute('aria-label')).toBe('Cantidad en stock de la nueva talla 41');
    stock.value = '8';
    stock.dispatchEvent(new Event('input'));
    expect(c['cantidadStock']('41')).toBe('8');
  });
  it('detecta cambios concurrentes sin sobrescribir inventario', async () => {
    await montar();
    const actual = inventarioActual();
    stockApi.detalle.mockResolvedValue({ ...actual, existencias: actual.existencias + 1 });
    editarCantidad('12');
    await c['guardarCambios']();
    expect(stockApi.registrar).not.toHaveBeenCalled();
    expect(c['conflicto']()).toBe(true);
    expect(c['cantidadStock'](actual.talla)).toBe('12');
  });
  it('recupera una respuesta perdida sin aplicar otra vez la cantidad', async () => {
    await montar();
    const actual = inventarioActual();
    stockApi.detalle.mockResolvedValue(actual);
    stockApi.registrar.mockImplementation(async () => {
      stockApi.pendiente.mockReturnValue({ varianteId: actual.id });
      throw new ErrorMovimientoInventario('Respuesta incierta', 0, true);
    });
    editarCantidad('12');
    await c['guardarCambios']();
    expect(c['stockPendiente']()).toBe(true);
    stockApi.recuperar.mockResolvedValue({ actual: { ...actual, existencias: 12 } });
    await c['recuperarStock']();
    await c['guardarCambios']();
    expect(c['stockPendiente']()).toBe(false);
    expect(c['cambios']()).toBe(false);
    expect(stockApi.registrar).toHaveBeenCalledTimes(1);
  });
  it('al desmarcar una talla nueva elimina su cantidad pendiente', async () => {
    await montar();
    c['elegirTalla']('45', { target: { checked: true } } as unknown as Event);
    editarCantidad('7', '45');
    c['elegirTalla']('45', { target: { checked: false } } as unknown as Event);
    expect(c['stockCambiado']()).toBe(false);
  });
  it('actualizar el perfil de la misma cuenta conserva campos, fotos y tarea sin recargar', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Nombre sin guardar' });
    c['galeria'].update((g) =>
      g.map((foto) => ({ ...foto, textoAlternativo: 'Foto sin guardar' })),
    );
    c['cambiarPaso']('fotos');
    const consultas = api.detalle.mock.calls.length;
    perfil.update((p) => ({ ...p!, nombres: 'Ana actualizada', verificado: false }));
    await f.whenStable();
    expect(c['formulario'].getRawValue().nombre).toBe('Nombre sin guardar');
    expect(c['galeria']()[0].textoAlternativo).toBe('Foto sin guardar');
    expect(c['pasoBorrador']()).toBe('fotos');
    expect(c['cambios']()).toBe(true);
    expect(api.detalle).toHaveBeenCalledTimes(consultas);
    expect(api.escribir).not.toHaveBeenCalled();
  });
  it('cambiar de cuenta reinicializa la ficha y elimina las ediciones de la cuenta anterior', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Edición de A' });
    c['cambiarPaso']('fotos');
    api.detalle.mockResolvedValue(
      productoEdicion({ ...fichaEdicionFixture(), nombre: 'Ficha de B' }),
    );
    perfil.update((p) => ({ ...p!, id: 'admin-b' }));
    await f.whenStable();
    expect(c['formulario'].getRawValue().nombre).toBe('Ficha de B');
    expect(c['pasoBorrador']()).toBe('variantes');
    expect(c['cambios']()).toBe(false);
    expect(api.escribir).not.toHaveBeenCalled();
  });
  it.each(['CLIENTE', null])(
    'perder permisos o sesión limpia el formulario privado: %s',
    async (rol) => {
      await montar();
      c['formulario'].patchValue({ nombre: 'Edición privada' });
      perfil.set(rol ? { ...perfil()!, rol: 'CLIENTE' } : null);
      await f.whenStable();
      expect(c['ficha']()).toBeNull();
      expect(c['galeria']()).toEqual([]);
      expect(c['formulario'].getRawValue().nombre).toBe('');
      expect(c['bloqueado']()).toBe(true);
      expect(api.escribir).not.toHaveBeenCalled();
    },
  );
  it('completa el borrador mostrando una tarea por vez y conservando las ediciones al cambiar', async () => {
    await montar();
    expect(f.nativeElement.querySelector('.secciones')).toBeNull();
    expect(f.nativeElement.querySelector('#sec-general').hidden).toBe(true);
    expect(f.nativeElement.querySelector('#sec-fotos').hidden).toBe(true);
    c['formulario'].patchValue({ precio: '120.00' });
    c['cambiarPaso']('fotos');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#sec-precio').hidden).toBe(true);
    expect(f.nativeElement.querySelector('#sec-fotos').hidden).toBe(false);
    expect(c['formulario'].getRawValue().precio).toBe('120.00');
    expect(c['cambios']()).toBe(true);
    expect(api.escribir).not.toHaveBeenCalled();
    c['cambiarPaso']('publicacion');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#sec-publicacion').hidden).toBe(false);
    expect(f.nativeElement.querySelector('.barra-guardar').textContent).toContain(
      'Publicar producto',
    );
  });
  it('guardar y continuar avanza solo después de confirmar el guardado', async () => {
    await montar();
    c['formulario'].patchValue({ precio: '120.00' });
    api.escribir.mockRejectedValueOnce(new ErrorEdicionProducto('Datos inválidos', 422));
    await c['continuarBorrador']();
    expect(c['pasoBorrador']()).toBe('variantes');
    expect(c['formulario'].getRawValue().precio).toBe('120.00');
    api.escribir.mockResolvedValue(
      productoEdicion({ ...fichaEdicionFixture(2), precio: '120.00' }),
    );
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    await c['continuarBorrador']();
    expect(c['pasoBorrador']()).toBe('fotos');
    expect(c['cambios']()).toBe(false);
  });
  it('editar datos y volver conserva el paso actual sin navegar ni publicar', async () => {
    await montar();
    c['cambiarPaso']('fotos');
    c['editarDatos']();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#sec-general').hidden).toBe(false);
    expect(f.nativeElement.querySelector('#sec-fotos').hidden).toBe(true);
    await c['continuarBorrador']();
    expect(c['editandoDatos']()).toBe(false);
    expect(c['pasoBorrador']()).toBe('fotos');
    expect(api.escribir).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
  it('usar como portada mueve la foto elegida al inicio y conserva las demás', async () => {
    await montar();
    const primera = c['galeria']()[0];
    const segunda = {
      archivoId: '72345678-1234-1234-1234-123456789abc',
      textoAlternativo: 'Segunda',
    };
    const tercera = {
      archivoId: '82345678-1234-1234-1234-123456789abc',
      textoAlternativo: 'Tercera',
    };
    c['galeria'].set([primera, segunda, tercera]);
    c['usarComoPortada'](2);
    expect(c['galeria']()).toEqual([tercera, primera, segunda]);
    expect(c['galeriaCambiada']()).toBe(true);
    expect(api.escribir).not.toHaveBeenCalled();
  });
  it('muestra el alta de inmediato y conserva lo escrito mientras llegan las opciones', async () => {
    let resolver!: (valor: ReturnType<typeof opcionesEdicion>) => void;
    api.opciones.mockReturnValue(new Promise((resolve) => (resolver = resolve)));
    await montar(null, () => {
      expect(c['cargando']()).toBe(true);
      const nombre = f.nativeElement.querySelector('#producto-nombre') as HTMLInputElement;
      expect(nombre).toBeTruthy();
      expect(nombre.matches(':disabled')).toBe(false);
      expect(f.nativeElement.textContent).not.toContain('Cargando datos del producto');
      expect(
        (f.nativeElement.querySelector('#producto-categoriaId') as HTMLSelectElement).matches(
          ':disabled',
        ),
      ).toBe(true);
      nombre.value = 'Nombre escrito durante la carga';
      nombre.dispatchEvent(new Event('input', { bubbles: true }));
      c['guardarDatos']();
      expect(api.escribir).not.toHaveBeenCalled();
      resolver(opcionesEdicion(opcionesEdicionFixture()));
    });
    expect(c['cargando']()).toBe(false);
    expect(c['formulario'].getRawValue().nombre).toBe('Nombre escrito durante la carga');
    expect(api.configuracion).not.toHaveBeenCalled();
  });
  it('el alta modal evita duplicar el contenido principal y cancela mediante evento sin navegar', async () => {
    await montar(null);
    f.componentRef.setInput('enModal', true);
    f.componentRef.setInput('volverA', '/admin/productos?estado=borrador&pagina=2');
    f.detectChanges();
    const cancelado = vi.fn();
    c.cancelado.subscribe(cancelado);
    expect(f.nativeElement.querySelector('#contenido-principal')).toBeNull();
    expect(f.nativeElement.querySelector('.ruta-producto')).toBeNull();
    expect(f.nativeElement.querySelector('.introduccion-producto')).toBeNull();
    expect(f.nativeElement.querySelector('.barra-guardar a')).toBeNull();
    f.nativeElement.querySelector('.barra-guardar button').click();
    expect(cancelado).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    const descripcion = f.nativeElement.querySelector(
      '#producto-descripcion',
    ) as HTMLTextAreaElement;
    expect(descripcion.required).toBe(false);
    descripcion.value = 'Zapatilla blanca y negra para uso diario.';
    descripcion.dispatchEvent(new Event('input', { bubbles: true }));
    c['formulario'].patchValue({ nombre: 'Nuevo desde modal' });
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture()));
    await c['guardarCambios']();
    expect(api.escribir.mock.calls[0][3].descripcion).toBe(
      'Zapatilla blanca y negra para uso diario.',
    );
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/admin/productos', ID_PRODUCTO_PRUEBA, 'editar'],
      { replaceUrl: true, queryParams: { volver: '/admin/productos?estado=borrador&pagina=2' } },
    );
  });
  it('muestra las categorías del menú y conserva sus identificadores al guardar', async () => {
    const opciones = opcionesEdicionFixture();
    opciones.categorias = ['Urbanas', 'Running/Gym', 'Básquet', 'Skate', 'Clásicos'].map(
      (nombre, i) => ({
        id: `42345678-1234-1234-1234-${String(i).padStart(12, '0')}`,
        nombre,
        activa: true,
      }),
    );
    api.opciones.mockResolvedValue(opcionesEdicion(opciones));
    await montar(null);
    const select = f.nativeElement.querySelector(
      '[formControlName="categoriaId"]',
    ) as HTMLSelectElement;
    expect([...select.options].slice(1).map((o) => o.textContent?.trim())).toEqual([
      'Urbanas',
      'Running/Gym',
      'Básquet',
      'Skate',
      'Clásicos',
    ]);
    select.value = opciones.categorias[2].id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    c['formulario'].patchValue({ nombre: 'Nuevo' });
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture()));
    await c['guardarCambios']();
    expect(api.escribir.mock.calls[0][3].categoriaId).toBe(opciones.categorias[2].id);
    expect(api.escribir.mock.calls[0][3]).not.toHaveProperty('categoria');
  });
  it('guardar cambios conserva la galería local y la guarda con la versión posterior a los datos', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Nombre actualizado' });
    c['galeria'].update((g) => g.map((foto) => ({ ...foto, textoAlternativo: 'Nueva portada' })));
    api.escribir
      .mockResolvedValueOnce(
        productoEdicion({ ...fichaEdicionFixture(2), nombre: 'Nombre actualizado' }),
      )
      .mockResolvedValueOnce(
        productoEdicion({ ...fichaEdicionFixture(3), nombre: 'Nombre actualizado' }),
      );
    const fotosFinales = galeriaEdicionFixture(3);
    fotosFinales.galeria[0].textoAlternativo = 'Nueva portada';
    api.fotografias
      .mockResolvedValueOnce(galeriaProducto(galeriaEdicionFixture(2)))
      .mockResolvedValueOnce(galeriaProducto(fotosFinales));
    await c['guardarCambios']();
    expect(api.escribir).toHaveBeenCalledTimes(2);
    expect(api.escribir.mock.calls[1]).toEqual([
      'ACTUALIZAR_GALERIA',
      ID_PRODUCTO_PRUEBA,
      2,
      { imagenes: [{ archivoId: ID_ARCHIVO_EDICION, textoAlternativo: 'Nueva portada' }] },
    ]);
    expect(c['cambios']()).toBe(false);
    expect(c['galeria']()[0].textoAlternativo).toBe('Nueva portada');
  });
  it('guardar cambios no envía la galería si se rechazan los datos y conserva ambas ediciones', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Edición local' });
    c['galeria'].update((g) => g.map((foto) => ({ ...foto, textoAlternativo: 'Texto local' })));
    api.escribir.mockRejectedValue(new ErrorEdicionProducto('Datos inválidos', 422));
    await c['guardarCambios']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    expect(c['datosCambiados']()).toBe(true);
    expect(c['galeriaCambiada']()).toBe(true);
    expect(c['galeria']()[0].textoAlternativo).toBe('Texto local');
  });
  it('guardar cambios permite guardar únicamente la galería', async () => {
    await montar();
    c['galeria'].update((g) => g.map((foto) => ({ ...foto, textoAlternativo: 'Solo foto' })));
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture(2)));
    const fotos = galeriaEdicionFixture(2);
    fotos.galeria[0].textoAlternativo = 'Solo foto';
    api.fotografias.mockResolvedValue(galeriaProducto(fotos));
    await c['guardarCambios']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    expect(api.escribir.mock.calls[0][0]).toBe('ACTUALIZAR_GALERIA');
    expect(c['cambios']()).toBe(false);
  });
  it('agrega la talla decimal sin reenviar saldos ni modificar variantes existentes', async () => {
    await montar();
    c['nuevasTallas'].set(['40.5']);
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture(2)));
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    await c['guardarDatos']();
    expect(api.escribir).toHaveBeenCalledWith(
      'ACTUALIZAR',
      ID_PRODUCTO_PRUEBA,
      1,
      expect.objectContaining({
        tallas: ['40.5'],
        grupoModelo: { id: ID_GRUPO_EDICION, version: 1 },
      }),
    );
    expect(api.escribir.mock.calls[0][3]).not.toHaveProperty('variantes');
  });
  it('conserva campos y tallas cuando el servidor rechaza el guardado', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Cambios pendientes' });
    c['nuevasTallas'].set(['40.5']);
    api.escribir.mockRejectedValue(new ErrorEdicionProducto('Datos inválidos', 422));
    await c['guardarDatos']();
    expect(c['formulario'].getRawValue().nombre).toBe('Cambios pendientes');
    expect(c['nuevasTallas']()).toEqual(['40.5']);
    expect(c['cambios']()).toBe(true);
  });
  it('mantiene seleccionado un grupo recién creado al editar el mismo borrador', async () => {
    const inicial = {
      ...fichaEdicionFixture(),
      grupoModelo: null,
      marca: null,
      modelo: null,
      codigoModelo: null,
      colores: [],
      variantes: [],
      inventario: {
        fisico: 0,
        reservado: 0,
        disponible: 0,
        bajo: 0,
        agotadas: 0,
        activas: 0,
        faltante: 0,
      },
    };
    api.detalle.mockResolvedValue(productoEdicion(inicial));
    api.fotografias.mockResolvedValue({
      productoId: ID_PRODUCTO_PRUEBA,
      version: 1,
      imagenes: [],
      archivos: [],
    });
    await montar();
    c['formulario'].patchValue({
      nombre: 'Grupo nuevo',
      marcaId: opcionesEdicionFixture().marcas[0].id,
      modelo: 'Nuevo modelo',
      codigoModelo: 'NUEVO',
      colorCodigo: 'BL',
      colorNombre: 'Blanco',
    });
    const grupoId = '72345678-1234-1234-1234-123456789abc';
    api.escribir.mockResolvedValue(
      productoEdicion({
        ...fichaEdicionFixture(2),
        grupoModelo: { id: grupoId, version: 1 },
        modelo: 'Nuevo modelo',
        codigoModelo: 'NUEVO',
        variantes: [],
        inventario: inicial.inventario,
      }),
    );
    api.fotografias.mockResolvedValue({
      productoId: ID_PRODUCTO_PRUEBA,
      version: 2,
      imagenes: [],
      archivos: [],
    });
    await c['guardarDatos']();
    expect(c['opciones']().gruposModelo.some((g) => g.id === grupoId)).toBe(true);
    c['formulario'].patchValue({ nombre: 'Otra edición' });
    await c['guardarDatos']();
    expect(api.escribir.mock.calls[1][3].grupoModelo).toEqual({ id: grupoId, version: 1 });
  });
  it('bloquea un segundo guardado mientras el primero sigue en curso', async () => {
    await montar();
    let resolver!: (v: ReturnType<typeof productoEdicion>) => void;
    api.escribir.mockReturnValue(new Promise((r) => (resolver = r)));
    c['formulario'].patchValue({ nombre: 'Cambio' });
    const p = c['guardarDatos']();
    await c['guardarDatos']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    resolver(productoEdicion(fichaEdicionFixture()));
    await p;
  });
  it('tras un 409 preserva campos y exige recarga consciente antes de reenviar', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Cambio local' });
    api.escribir.mockRejectedValue(new ErrorEdicionProducto('La versión cambió', 409));
    await c['guardarDatos']();
    await c['guardarDatos']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    expect(c['formulario'].getRawValue().nombre).toBe('Cambio local');
    expect(c['conflicto']()).toBe(true);
  });
  it('recupera una operación incierta consultando la clave, sin crear otra escritura', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Cambio local' });
    api.pendiente.mockReturnValue({ claveSolicitud: 'pendiente' });
    api.escribir.mockRejectedValue(new ErrorEdicionProducto('Resultado incierto', 0, true));
    await c['guardarDatos']();
    expect(c['pendiente']()).toBe(true);
    await c['guardarDatos']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    api.recuperar.mockResolvedValue(productoEdicion(fichaEdicionFixture(2)));
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    await c['recuperar']();
    expect(api.recuperar).toHaveBeenCalledWith(false);
    expect(c['pendiente']()).toBe(false);
    expect(c['ficha']()?.version).toBe(2);
  });
  it('guarda galería ordenada con portada y textos sin URLs suministradas por el cliente', async () => {
    await montar();
    c['galeria'].set([{ archivoId: ID_ARCHIVO_EDICION, textoAlternativo: 'Nueva descripción' }]);
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture(2)));
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    await c['guardarGaleria']();
    expect(api.escribir).toHaveBeenCalledWith('ACTUALIZAR_GALERIA', ID_PRODUCTO_PRUEBA, 1, {
      imagenes: [{ archivoId: ID_ARCHIVO_EDICION, textoAlternativo: 'Nueva descripción' }],
    });
    expect(c['galeriaCambiada']()).toBe(false);
  });
  it('preserva una galería sin guardar al guardar los campos comerciales', async () => {
    await montar();
    c['galeria'].set([]);
    c['formulario'].patchValue({ nombre: 'Cambio' });
    api.escribir.mockResolvedValue(productoEdicion(fichaEdicionFixture(2)));
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    await c['guardarDatos']();
    expect(c['galeria']()).toEqual([]);
    expect(c['galeriaCambiada']()).toBe(true);
  });
  it('impide guardar galería y publicar mientras los datos tienen cambios', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Cambio' });
    c['galeria'].set([]);
    await c['guardarGaleria']();
    await c['confirmarPublicacion']();
    expect(api.escribir).not.toHaveBeenCalled();
  });
  it('solicita confirmación y publica con la versión actual, permitiendo stock cero', async () => {
    const raw = fichaEdicionFixture();
    raw.variantes[0] = { ...raw.variantes[0], existencias: 0, cantidadReservada: 0, disponible: 0 };
    raw.inventario = {
      fisico: 0,
      reservado: 0,
      disponible: 0,
      bajo: 0,
      agotadas: 1,
      activas: 1,
      faltante: 0,
    };
    api.detalle.mockResolvedValue(productoEdicion(raw));
    await montar();
    c['cambiarPaso']('publicacion');
    f.detectChanges();
    const boton = [...f.nativeElement.querySelectorAll('button')].find(
      (b: unknown) => (b as HTMLButtonElement).textContent?.trim() === 'Publicar producto',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    boton.click();
    await f.whenStable();
    expect(api.escribir).not.toHaveBeenCalled();
    expect(c['dialogo']()).toBe('publicar');
    api.escribir.mockResolvedValue(productoEdicion({ ...raw, version: 2, estado: 'publicado' }));
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    await c['confirmarPublicacion']();
    expect(api.escribir).toHaveBeenCalledWith('PUBLICAR', ID_PRODUCTO_PRUEBA, 1, {});
    expect(c['soloConsulta']()).toBe(false);
    expect(c['publicado']()).toBe(true);
  });
  it('muestra las incidencias de publicación y conserva el borrador', async () => {
    await montar();
    api.escribir.mockRejectedValue(
      new ErrorEdicionProducto('Revisa los requisitos', 422, false, ['GALERIA_INCOMPLETA']),
    );
    await c['confirmarPublicacion']();
    expect(c['incidencias']()[0]).toContain('fotografías');
    expect(c['ficha']()?.producto.estado).toBe('borrador');
  });
  it('recuperar una fotografía ya incluida no duplica la galería ni su guardado', async () => {
    await montar();
    api.subir.mockResolvedValue(archivoEdicionFixture());
    const file = new File(['png'], 'nueva.png', { type: 'image/png' }),
      entrada = { files: [file], value: 'nueva.png' };
    await c['subir']({ target: entrada } as unknown as Event);
    expect(entrada.value).toBe('');
    expect(api.subir).toHaveBeenCalledWith(ID_PRODUCTO_PRUEBA, 1, expect.any(String), file);
    expect(c['carga']()).toBeNull();
    expect(c['galeria']()).toHaveLength(1);
  });
  function prepararCargaAutomatica() {
    const archivos = [archivoEdicionFixture()];
    api.subir.mockImplementation(async (_id, _version, _clave, file: File) => {
      const foto = {
        ...archivoEdicionFixture(),
        id:
          archivos.length === 1
            ? '72345678-1234-1234-1234-123456789abc'
            : '82345678-1234-1234-1234-123456789abc',
        nombre: file.name,
      };
      archivos.push(foto);
      return foto;
    });
    api.escribir.mockImplementation(async (_tipo, _id, version, datos) => {
      api.fotografias.mockResolvedValue({
        productoId: ID_PRODUCTO_PRUEBA,
        version: version + 1,
        imagenes: datos.imagenes,
        archivos,
      });
      return productoEdicion(fichaEdicionFixture(version + 1));
    });
  }
  function eventoFotos(nombres: string[]) {
    return {
      target: {
        files: nombres.map((nombre) => new File(['png'], nombre, { type: 'image/png' })),
        value: 'foto.png',
      },
    } as unknown as Event;
  }
  it('subir una foto la agrega y guarda automáticamente conservando la portada existente', async () => {
    await montar();
    prepararCargaAutomatica();
    await c['subir'](eventoFotos(['nueva.png']));
    expect(api.subir).toHaveBeenCalledTimes(1);
    expect(api.escribir).toHaveBeenCalledWith(
      'ACTUALIZAR_GALERIA',
      ID_PRODUCTO_PRUEBA,
      1,
      expect.objectContaining({
        imagenes: expect.arrayContaining([
          expect.objectContaining({ archivoId: '72345678-1234-1234-1234-123456789abc' }),
        ]),
      }),
    );
    expect(c['galeria']()).toHaveLength(2);
    expect(c['galeria']()[0].archivoId).toBe(ID_ARCHIVO_EDICION);
    expect(c['galeriaCambiada']()).toBe(false);
  });
  it('sube varias fotos en orden con la versión actualizada de cada guardado', async () => {
    await montar();
    prepararCargaAutomatica();
    await c['subir'](eventoFotos(['primera.png', 'segunda.png']));
    expect(c['galeria']()).toHaveLength(3);
    expect(api.subir.mock.calls.map((c) => c[1])).toEqual([1, 2]);
    expect(api.escribir).toHaveBeenCalledTimes(2);
    expect(c['galeriaCambiada']()).toBe(false);
  });
  it('si falla la galería conserva la foto local y detiene el lote sin volver a subirla', async () => {
    await montar();
    prepararCargaAutomatica();
    api.escribir.mockRejectedValueOnce(new ErrorEdicionProducto('Datos inválidos', 422));
    await c['subir'](eventoFotos(['primera.png', 'segunda.png']));
    expect(api.subir).toHaveBeenCalledTimes(1);
    expect(c['galeria']()).toHaveLength(2);
    expect(c['galeriaCambiada']()).toBe(true);
    await c['guardarCambios']();
    expect(api.subir).toHaveBeenCalledTimes(1);
    expect(c['galeriaCambiada']()).toBe(false);
  });
  it('rechaza un lote que exceda ocho fotos antes de subir cualquier archivo', async () => {
    await montar();
    prepararCargaAutomatica();
    await c['subir'](eventoFotos(Array.from({ length: 8 }, (_, i) => i + '.png')));
    expect(api.subir).not.toHaveBeenCalled();
    expect(c['error']()).toContain('8 fotografías');
  });
  it('no sube archivos inválidos, excesivos o con cambios sin guardar', async () => {
    await montar();
    const archivo = new File(['x'], 'archivo.gif', { type: 'image/gif' });
    await c['subir']({ target: { files: [archivo], value: 'x' } } as unknown as Event);
    expect(api.subir).not.toHaveBeenCalled();
    c['formulario'].patchValue({ nombre: 'Cambio' });
    await c['subir']({
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })], value: 'x' },
    } as unknown as Event);
    expect(api.subir).not.toHaveBeenCalled();
  });
  it('mantiene una carga incierta tras un 404 de consulta y bloquea otra carga', async () => {
    await montar();
    api.subir.mockRejectedValue(new ErrorEdicionProducto('Resultado incierto', 0, true));
    api.carga.mockRejectedValue(new ErrorEdicionProducto('No encontrada', 404));
    const archivo = new File(['x'], 'foto.png', { type: 'image/png' });
    await c['subir']({ target: { files: [archivo], value: 'x' } } as unknown as Event);
    const clave = c['carga']()!.clave;
    await c['consultarCarga']();
    expect(c['carga']()?.clave).toBe(clave);
    expect(sessionStorage.getItem('soho:carga-producto:admin-a')).toContain(clave);
    expect(c['bloqueado']()).toBe(true);
  });
  it('un conflicto definitivo en la primera carga permite recargar la versión', async () => {
    await montar();
    api.subir.mockRejectedValue(new ErrorEdicionProducto('La versión cambió', 409));
    await c['subir']({
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })], value: 'x' },
    } as unknown as Event);
    expect(c['carga']()).toBeNull();
    expect(c['conflicto']()).toBe(true);
  });
  it('un rechazo al reintentar no descarta una carga que antes fue incierta', async () => {
    await montar();
    api.subir.mockRejectedValueOnce(new ErrorEdicionProducto('Respuesta perdida', 0, true));
    await c['subir']({
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })], value: 'x' },
    } as unknown as Event);
    const clave = c['carga']()!.clave;
    api.subir.mockRejectedValueOnce(new ErrorEdicionProducto('Conflicto', 409));
    await c['enviarCarga']();
    expect(c['carga']()?.clave).toBe(clave);
    expect(sessionStorage.getItem('soho:carga-producto:admin-a')).toContain(clave);
  });
  it('advierte al salir y permite conservar los cambios', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Conservar' });
    const p = c.puedeSalir();
    expect(p).toBeInstanceOf(Promise);
    c['cerrarDialogo']();
    expect(await p).toBe(false);
    expect(c['formulario'].getRawValue().nombre).toBe('Conservar');
  });
  it('navega entre secciones sin abandonar la ruta ni perder campos', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Cambio local' });
    const panel = f.nativeElement.querySelector('#sec-fotos') as HTMLElement;
    Object.defineProperty(panel, 'scrollIntoView', { value: vi.fn(), configurable: true });
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    f.nativeElement.querySelector('.tareas-borrador button:nth-child(2)').dispatchEvent(evento);
    await f.whenStable();
    expect(panel.scrollIntoView).toHaveBeenCalled();
    expect(c['pasoBorrador']()).toBe('fotos');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    expect(c['formulario'].getRawValue().nombre).toBe('Cambio local');
  });
  it('edita publicados con campos comerciales y contexto propio sin enviar identidad ni inventario', async () => {
    api.detalle.mockResolvedValue(
      productoEdicion({ ...fichaEdicionFixture(), estado: 'publicado' }),
    );
    await montar();
    expect(c['soloConsulta']()).toBe(false);
    expect(c['publicado']()).toBe(true);
    c['formulario'].patchValue({
      nombre: 'Publicado corregido',
      precio: '120.00',
      colorNombre: 'Cambio no permitido',
    });
    api.escribir.mockResolvedValue(
      productoEdicion({
        ...fichaEdicionFixture(2),
        estado: 'publicado',
        nombre: 'Publicado corregido',
        precio: '120.00',
      }),
    );
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    await c['guardarDatos']();
    expect(api.escribir).toHaveBeenCalledWith(
      'ACTUALIZAR',
      ID_PRODUCTO_PRUEBA,
      1,
      expect.objectContaining({ nombre: 'Publicado corregido', precio: '120.00' }),
      'publicado',
    );
    const datos = api.escribir.mock.calls[0][3];
    for (const k of [
      'grupoModelo',
      'color',
      'tallas',
      'variantes',
      'sku',
      'existencias',
      'cantidadReservada',
    ])
      expect(datos).not.toHaveProperty(k);
    await c['confirmarPublicacion']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    expect(c['ficha']()?.producto.variantes[0].existencias).toBe(5);
  });
  it('mantiene archivados en consulta y no ofrece el enlace público', async () => {
    api.detalle.mockResolvedValue(
      productoEdicion({ ...fichaEdicionFixture(), estado: 'archivado' }),
    );
    await montar();
    expect(c['soloConsulta']()).toBe(true);
    c['formulario'].patchValue({ nombre: 'No guardar' });
    await c['guardarDatos']();
    await c['confirmarPublicacion']();
    expect(api.escribir).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).not.toContain('Ver en la tienda');
  });
  it('conserva la última fotografía de un publicado y sus tallas quedan en consulta', async () => {
    api.detalle.mockResolvedValue(
      productoEdicion({ ...fichaEdicionFixture(), estado: 'publicado' }),
    );
    await montar();
    c['quitarFoto'](0);
    expect(c['galeria']()).toHaveLength(1);
    expect(f.nativeElement.querySelector('.seleccion-tallas')).toBeNull();
    expect(
      (f.nativeElement.querySelector('[formControlName="colorNombre"]') as HTMLInputElement)
        .readOnly,
    ).toBe(true);
    c['galeria'].set([]);
    await c['guardarGaleria']();
    expect(api.escribir).not.toHaveBeenCalled();
    expect(c['error']()).toContain('al menos una fotografía');
  });
  it('rechaza precio vacío o anterior incompatible en publicados conservando los campos', async () => {
    api.detalle.mockResolvedValue(
      productoEdicion({ ...fichaEdicionFixture(), estado: 'publicado' }),
    );
    await montar();
    c['formulario'].patchValue({ precio: '' });
    await c['guardarDatos']();
    expect(api.escribir).not.toHaveBeenCalled();
    c['formulario'].patchValue({ precio: '120.00', precioAnterior: '110.00' });
    await c['guardarDatos']();
    expect(api.escribir).not.toHaveBeenCalled();
    expect(c['formulario'].getRawValue().precioAnterior).toBe('110.00');
  });
  it('un fallo de actualización después del éxito bloquea escrituras y reintenta solo lecturas', async () => {
    await montar();
    c['formulario'].patchValue({ nombre: 'Cambio confirmado' });
    const f2 = productoEdicion({ ...fichaEdicionFixture(2), nombre: 'Cambio confirmado' });
    api.escribir.mockResolvedValue(f2);
    api.fotografias.mockResolvedValue(galeriaProducto(galeriaEdicionFixture(2)));
    const refresh = vi
      .spyOn(TestBed.inject(ProductosAdministracion), 'actualizarInventario')
      .mockResolvedValue(false);
    await c['guardarDatos']();
    expect(c['confirmadoSinActualizar']()).toBe(true);
    await c['guardarDatos']();
    expect(api.escribir).toHaveBeenCalledTimes(1);
    api.detalle.mockResolvedValue(f2);
    refresh.mockResolvedValue(true);
    await c['actualizarConsultas']();
    expect(c['confirmadoSinActualizar']()).toBe(false);
    expect(c['cambios']()).toBe(false);
    expect(api.escribir).toHaveBeenCalledTimes(1);
  });
  it('un registro pendiente inválido conserva el formulario y permite únicamente consulta', async () => {
    api.pendiente.mockImplementation(() => {
      throw new ErrorEdicionProducto('Solicitud pendiente ilegible', 0, true);
    });
    await montar();
    expect(c['pendiente']()).toBe(true);
    expect(c['reintentoDisponible']()).toBe(false);
    await c['guardarDatos']();
    c['recuperar'](true);
    expect(api.escribir).not.toHaveBeenCalled();
    expect(api.recuperar).not.toHaveBeenCalled();
  });
});
