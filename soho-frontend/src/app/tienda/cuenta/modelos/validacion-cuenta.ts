export function correoValido(correo: string): boolean {
  return (
    Array.from(correo.trim().toLowerCase()).length <= 254 &&
    !/[\p{Cc}\p{Cf}]/u.test(correo) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(correo.trim())
  );
}
export function requisitosClave(clave: string) {
  return [
    {
      texto: 'Entre 15 y 128 caracteres',
      cumple: Array.from(clave).length >= 15 && Array.from(clave).length <= 128,
    },
  ];
}
export function claveValida(clave: string): boolean {
  return (
    requisitosClave(clave).every((r) => r.cumple) &&
    !clave.includes('\0') &&
    new TextEncoder().encode(clave).length <= 512
  );
}
export function nombreValido(nombre: string, maximo = 80): boolean {
  return (
    Array.from(nombre.trim()).length >= 2 &&
    Array.from(nombre.trim()).length <= maximo &&
    !/[\p{Cc}\p{Cf}]/u.test(nombre)
  );
}
export function destinoCuenta(valor: string | null | undefined): string {
  return valor &&
    valor.length <= 1024 &&
    /^\/(?:finalizar-compra|mi-cuenta(?:\/(?:perfil|direcciones|pedidos))?|pedido\/[A-Za-z0-9-]+|admin(?:\/[A-Za-z0-9_-]+)*(?:\?[A-Za-z0-9%&=+._~-]*)?)$/.test(
      valor,
    )
    ? valor
    : '/mi-cuenta';
}
export function esRutaPrivada(url: string): boolean {
  return /^\/(?:admin|mi-cuenta)(?:\/|[?#]|$)/.test(url);
}
