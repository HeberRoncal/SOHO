export default {
  test: {
    // Evita que las pruebas de navegación compitan por recursos al compilar las vistas.
    maxWorkers: 2,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
};
