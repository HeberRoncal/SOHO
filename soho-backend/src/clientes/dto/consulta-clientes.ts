import { BadRequestException } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';

const invalido = (): never => {
  throw new BadRequestException('La consulta de clientes no es válida.');
};
function entero(valor: unknown, defecto: number, maximo: number) {
  if (valor === undefined) return defecto;
  if (typeof valor !== 'string' || !/^[1-9]\d{0,5}$/.test(valor))
    return invalido();
  const numero = Number(valor);
  return numero <= maximo ? numero : invalido();
}
function opcion<T extends string>(
  valor: unknown,
  opciones: readonly T[],
  defecto: T,
): T {
  if (valor === undefined) return defecto;
  return typeof valor === 'string' && opciones.includes(valor as T)
    ? (valor as T)
    : invalido();
}
export function leerPaginaClientes(valor: unknown) {
  const q = objeto(valor, ['pagina', 'limite']);
  return {
    pagina: entero(q.pagina, 1, 100000),
    limite: entero(q.limite, 20, 50),
  };
}
export type PaginaClientes = ReturnType<typeof leerPaginaClientes>;
export function leerClientes(valor: unknown) {
  const q = objeto(valor, ['busqueda', 'tipo', 'orden', 'pagina', 'limite']);
  if (
    q.busqueda !== undefined &&
    (typeof q.busqueda !== 'string' ||
      q.busqueda.length > 120 ||
      /[\p{Cc}\p{Cf}]/u.test(q.busqueda))
  )
    return invalido();
  return {
    busqueda: (q.busqueda as string | undefined)?.trim() ?? '',
    tipo: opcion(
      q.tipo,
      ['registrado', 'invitado'] as const,
      '' as 'registrado' | 'invitado' | '',
    ),
    orden: opcion(
      q.orden,
      ['recientes', 'nombre', 'pedidos'] as const,
      'recientes',
    ),
    ...leerPaginaClientes({ pagina: q.pagina, limite: q.limite }),
  };
}
export type ConsultaClientes = ReturnType<typeof leerClientes>;
export function identidadCliente(valor: unknown) {
  if (typeof valor !== 'string') return invalido();
  const invitado = valor.startsWith('invitado:'),
    id = invitado ? valor.slice(9) : valor;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return invalido();
  const normalizado = id.toLowerCase();
  return {
    id: normalizado,
    tipo: invitado ? ('invitado' as const) : ('registrado' as const),
    identificador: invitado ? `invitado:${normalizado}` : normalizado,
  };
}
export type IdentidadCliente = ReturnType<typeof identidadCliente>;
