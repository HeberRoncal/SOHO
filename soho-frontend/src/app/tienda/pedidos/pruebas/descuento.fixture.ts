// Cupón ilustrativo exclusivo de las pruebas del servicio local antiguo.
export function descuentoPrueba(subtotal: number, cupon?: string): number {
  return cupon === 'DEMO10' ? Math.round(subtotal * 10) / 100 : 0;
}
