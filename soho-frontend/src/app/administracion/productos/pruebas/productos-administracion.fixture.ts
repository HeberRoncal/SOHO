import type { Provider } from '@angular/core';
import { ProductosAdministracion } from '../servicios/productos-administracion';
import { Injectable, computed, signal } from '@angular/core';
import { PRODUCTOS_ADMIN_PRUEBA } from './productos.fixtures';
import { EstadoProductoAdmin } from '../modelos/producto-administracion';
import { EdicionVariantes } from '../modelos/edicion-variantes';
import {
  DatosMovimiento,
  MovimientoInventario,
  evaluarMovimiento,
} from '../modelos/movimiento-inventario';
import { ProductoAdministracion } from '../modelos/producto-administracion';
import { VarianteProducto } from '../../../tienda/catalogo/modelos/variante-producto';
import {
  EdicionProducto,
  importeProducto,
  validarEdicionProducto,
} from '../modelos/edicion-producto';
import {
  PAGINA_PRODUCTOS,
  EstadoConsultaProductos,
  OpcionesProductos,
  ResumenInventario,
} from '../modelos/consulta-productos-api';
@Injectable({ providedIn: 'root' })
export class ProductosAdministracionPrueba {
  readonly remoto: boolean = false;
  readonly soloLectura: boolean = false;
  readonly borradoresDisponibles: boolean = true;
  readonly movimientosDisponibles: boolean = true;
  readonly publicadosDisponibles: boolean = true;
  readonly archivoDisponible: boolean = true;
  readonly restauracionDisponible: boolean = true;
  readonly estadoListado = signal<EstadoConsultaProductos>('lista');
  readonly mensajeListado = signal('');
  readonly paginacion = signal({ ...PAGINA_PRODUCTOS });
  readonly opciones = signal<OpcionesProductos>({ marcas: [], categorias: [] });
  readonly estadoOpciones = signal<EstadoConsultaProductos>('lista');
  readonly detalleActual = signal<ProductoAdministracion | null>(null);
  readonly estadoDetalle = signal<EstadoConsultaProductos>('lista');
  readonly mensajeDetalle = signal('');
  readonly estadoMovimientos = signal<EstadoConsultaProductos>('lista');
  readonly mensajeMovimientos = signal('');
  readonly paginaMovimientos = signal({ ...PAGINA_PRODUCTOS });
  readonly resumenRemoto = signal<ResumenInventario | null>(null);
  readonly estadoResumen = signal<EstadoConsultaProductos>('lista');
  readonly mensajeResumen = signal('');
  cargarListado(_filtros: Record<string, string> = {}): Promise<void> {
    return Promise.resolve();
  }
  cargarOpciones(): Promise<void> {
    return Promise.resolve();
  }
  cargarDetalle(_id: string): Promise<void> {
    return Promise.resolve();
  }
  cargarMovimientos(_filtros: Record<string, string> = {}): Promise<void> {
    return Promise.resolve();
  }
  cargarResumen(): Promise<void> {
    return Promise.resolve();
  }
  actualizarInventario(_productoId: string): Promise<boolean> {
    return Promise.resolve(true);
  }
  private secuenciaMovimiento = 0;
  private readonly registro = signal<readonly MovimientoInventario[]>([]);
  readonly movimientos = this.registro.asReadonly();
  private crearRegistro(
    producto: ProductoAdministracion,
    variante: VarianteProducto,
    tipo: MovimientoInventario['tipo'],
    delta: number,
    anterior: number,
    motivo: string,
    referencia: string,
    origen: MovimientoInventario['origen'],
  ): MovimientoInventario {
    return Object.freeze({
      identificador: 'MOV-' + String(++this.secuenciaMovimiento).padStart(5, '0'),
      fecha: new Date().toISOString(),
      administrador: 'Admin Demo',
      productoId: producto.identificador,
      producto: producto.nombre,
      sku: variante.sku,
      color:
        producto.colores.find((c) => c.codigo === variante.codigoColor)?.nombre ??
        variante.codigoColor,
      talla: variante.talla,
      tipo,
      cantidad: delta,
      saldoAnterior: anterior,
      saldo: variante.existencias,
      reservado: variante.cantidadReservada,
      disponible: variante.habilitada
        ? Math.max(0, variante.existencias - variante.cantidadReservada)
        : 0,
      motivo,
      referencia,
      origen,
    });
  }
  registrarMovimiento(datos: DatosMovimiento) {
    const producto = this.productos().find((p) => p.variantes.some((v) => v.sku === datos.sku));
    const variante = producto?.variantes.find((v) => v.sku === datos.sku);
    const resultado = evaluarMovimiento(datos, variante);
    if (!producto || !variante || Object.keys(resultado.errores).length)
      return { movimiento: null, errores: resultado.errores };
    const actualizada = Object.freeze({ ...variante, existencias: resultado.saldo! });
    const movimiento = this.crearRegistro(
      producto,
      actualizada,
      datos.tipo,
      resultado.delta,
      variante.existencias,
      datos.motivo.trim(),
      datos.referencia.trim(),
      'manual',
    );
    this.actuales.update((productos) =>
      Object.freeze(
        productos.map((p) =>
          p.identificador === producto.identificador
            ? Object.freeze({
                ...p,
                variantes: Object.freeze(
                  p.variantes.map((v) => (v.sku === datos.sku ? actualizada : v)),
                ),
              })
            : p,
        ),
      ),
    );
    this.registro.update((registro) => Object.freeze([movimiento, ...registro]));
    return { movimiento, errores: {} };
  }
  private avisoPendiente: { identificador: string; mensaje: string } | null = null;
  tomarAviso(identificador: string | null) {
    if (this.avisoPendiente?.identificador !== identificador) return '';
    const mensaje = this.avisoPendiente!.mensaje;
    this.avisoPendiente = null;
    return mensaje;
  }
  private readonly actuales = signal(PRODUCTOS_ADMIN_PRUEBA);
  readonly productos = this.actuales.asReadonly();
  readonly siguienteCodigo = computed(
    () =>
      'SHO-' +
      String(
        Math.max(0, ...this.productos().map((p) => Number(p.codigoInterno.slice(4)) || 0)) + 1,
      ).padStart(4, '0'),
  );
  readonly resumen = computed(() => ({
    publicados: this.productos().filter((p) => p.estado === 'publicado').length,
    borradores: this.productos().filter((p) => p.estado === 'borrador').length,
    archivados: this.productos().filter((p) => p.estado === 'archivado').length,
    variantes: this.productos().reduce((n, p) => n + p.variantes.length, 0),
  }));
  archivar(identificador: string) {
    return this.cambiarEstado(identificador, 'archivado');
  }
  restaurar(identificador: string) {
    return this.cambiarEstado(identificador, 'borrador');
  }
  guardar(
    datos: EdicionProducto,
    estado: EstadoProductoAdmin,
    identificador?: string,
    edicionVariantes?: EdicionVariantes,
  ) {
    const original = this.productos().find((p) => p.identificador === identificador);
    if (identificador && !original)
      return {
        producto: null,
        errores: { nombre: 'El producto ya no está disponible. Vuelve al listado.' },
      };
    const codigo = original?.codigoInterno ?? this.siguienteCodigo();
    const errores = validarEdicionProducto(
      datos,
      estado,
      this.productos(),
      original,
      edicionVariantes,
      codigo,
    );
    if (Object.keys(errores).length) return { producto: null, errores };
    const producto = Object.freeze({
      ...original,
      identificador: original?.identificador ?? 'demo-' + codigo.toLowerCase(),
      codigoInterno: codigo,
      nombre: datos.nombre.trim(),
      marca: datos.marca.trim(),
      categoria: datos.categoria.trim(),
      genero: datos.genero,
      modelo: datos.modelo.trim(),
      codigoModelo: datos.codigoModelo.trim().toUpperCase(),
      descripcion: datos.descripcion.trim(),
      precio: importeProducto(datos.precio) ?? 0,
      precioAnterior: datos.precioAnterior.trim() ? importeProducto(datos.precioAnterior) : null,
      esNovedad: datos.esNovedad,
      esDestacado: datos.esDestacado,
      imagenes: Object.freeze([...datos.imagenes]),
      colores: edicionVariantes
        ? Object.freeze(
            edicionVariantes.colores.map(
              (c) =>
                original?.colores.find((anterior) => anterior.codigo === c.codigo) ??
                Object.freeze({
                  ...c,
                  nombre: c.nombre.trim(),
                  imagenes: Object.freeze([...c.imagenes]),
                }),
            ),
          )
        : (original?.colores ?? Object.freeze([])),
      variantes: edicionVariantes
        ? Object.freeze(edicionVariantes.variantes.map((v) => Object.freeze({ ...v })))
        : (original?.variantes ?? Object.freeze([])),
      estado,
    });
    this.actuales.update((productos) =>
      Object.freeze(
        original
          ? productos.map((p) => (p.identificador === original.identificador ? producto : p))
          : [producto, ...productos],
      ),
    );
    const iniciales = producto.variantes
      .filter(
        (v) => v.existencias > 0 && !original?.variantes.some((anterior) => anterior.sku === v.sku),
      )
      .map((v) =>
        this.crearRegistro(
          producto,
          v,
          'entrada',
          v.existencias,
          0,
          'Stock inicial',
          'Creación de variante',
          'stock-inicial',
        ),
      );
    if (iniciales.length)
      this.registro.update((registro) => Object.freeze([...iniciales.reverse(), ...registro]));
    this.avisoPendiente = {
      identificador: producto.identificador,
      mensaje:
        estado === 'publicado'
          ? 'Producto publicado en la demostración.'
          : estado === 'archivado'
            ? 'Cambios del producto archivado guardados en la demostración.'
            : 'Borrador guardado en la demostración.',
    };
    return { producto, errores: {} };
  }
  private cambiarEstado(identificador: string, estado: EstadoProductoAdmin): boolean {
    const producto = this.productos().find((p) => p.identificador === identificador);
    if (!producto || (estado === 'borrador' && producto.estado !== 'archivado')) return false;
    this.actuales.update((productos) =>
      Object.freeze(
        productos.map((p) =>
          p.identificador === identificador ? Object.freeze({ ...p, estado }) : p,
        ),
      ),
    );
    return true;
  }
  restablecer() {
    this.registro.set([]);
    this.secuenciaMovimiento = 0;
    this.avisoPendiente = null;
    this.actuales.set(PRODUCTOS_ADMIN_PRUEBA);
  }
}

export const proveerProductosAdministracionPrueba = (): Provider => ({
  provide: ProductosAdministracion,
  useExisting: ProductosAdministracionPrueba,
});
