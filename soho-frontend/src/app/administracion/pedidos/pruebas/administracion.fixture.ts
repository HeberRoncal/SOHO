import type { Provider } from '@angular/core';
import { PagosAdministracion } from '../../pagos/servicios/pagos-administracion';
import { PagosAdministracionPrueba } from '../../pagos/pruebas/pagos-administracion.fixture';
import { PedidosAdministracion } from '../servicios/pedidos-administracion';
import { PedidosAdministracionPrueba } from './pedidos-administracion.fixture';

export function proveerAdministracionPrueba(): Provider[] {
  return [
    { provide: PagosAdministracion, useExisting: PagosAdministracionPrueba },
    { provide: PedidosAdministracion, useExisting: PedidosAdministracionPrueba },
  ];
}
