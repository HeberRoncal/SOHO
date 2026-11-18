import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['test/**/*.db-spec.ts'],
    exclude: [
      'test/atencion-recepciones.db-spec.ts',
      'test/procesamiento-recepciones.db-spec.ts',
      'test/recepciones-compra.db-spec.ts',
      'test/instrucciones-pago.db-spec.ts',
      'test/configuracion-pagos.db-spec.ts',
      'test/clientes.db-spec.ts',
      'test/publicados-producto.db-spec.ts',
      'test/archivo-producto.db-spec.ts',
      'test/movimientos-inventario.db-spec.ts',
      'test/publicacion-producto.db-spec.ts',
      'test/fotografias-producto.db-spec.ts',
      'test/conversion-catalogo.db-spec.ts',
      'test/borradores-producto.db-spec.ts',
    ],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
