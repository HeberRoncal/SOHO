import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PresentacionTienda } from '../../../../estructuras/servicios/presentacion-tienda';

@Component({
  selector: 'app-colecciones',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './colecciones.html',
  styleUrl: './colecciones.css',
})
export class Colecciones {
  protected readonly presentacion = inject(PresentacionTienda);
  protected readonly colecciones = [
    {
      nombre: 'Urbano',
      imagen: 'estilo-urbano.jpg',
      descripcion: 'Siluetas para moverte por la ciudad.',
      categorias: ['Skate', 'Básquet'],
      alternativa: 'Zapatillas urbanas en un cruce peatonal',
    },
    {
      nombre: 'Running',
      imagen: 'estilo-running.jpg',
      descripcion: 'Amortiguación para cada kilómetro.',
      categorias: ['Running/Gym'],
      alternativa: 'Persona corriendo en una calle de la ciudad',
    },
    {
      nombre: 'Clásicos',
      imagen: 'estilo-clasicos.jpg',
      descripcion: 'Los íconos que nunca se van.',
      categorias: ['Urbanas', 'Clásicos'],
      alternativa: 'Zapatillas blancas sobre un muro de ladrillo',
    },
  ];
}
