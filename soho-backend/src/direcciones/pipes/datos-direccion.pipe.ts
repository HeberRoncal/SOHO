import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import type { ActualizarDireccionDto } from '../dto/actualizar-direccion.dto.js';
import type { CrearDireccionDto } from '../dto/crear-direccion.dto.js';

const limites = {
  etiqueta: [2, 40],
  destinatario: [2, 140],
  celular: [9, 9],
  distrito: [1, 80],
  direccion: [6, 180],
  referencia: [0, 200],
} as const;

@Injectable()
export class DatosDireccionPipe implements PipeTransform {
  constructor(
    private readonly modo: 'crear' | 'actualizar' | 'predeterminar' = 'crear',
  ) {}

  transform(valor: unknown): CrearDireccionDto | ActualizarDireccionDto {
    const datos = objeto(
      valor,
      this.modo === 'predeterminar'
        ? []
        : [...Object.keys(limites), 'predeterminada'],
    );
    if (this.modo === 'predeterminar') return {};
    if (this.modo === 'actualizar' && !Object.keys(datos).length)
      throw new BadRequestException(
        'Indica los campos de la dirección que quieres actualizar.',
      );
    const resultado: Record<string, string | boolean> = {};
    for (const [campo, [minimo, maximo]] of Object.entries(limites)) {
      if (!Object.hasOwn(datos, campo)) {
        if (this.modo === 'actualizar') continue;
        if (campo === 'referencia') {
          resultado.referencia = '';
          continue;
        }
        throw new BadRequestException('Completa los datos de la dirección.');
      }
      const valorCampo = datos[campo];
      if (typeof valorCampo !== 'string')
        throw new BadRequestException(
          'Los datos de la dirección no son válidos.',
        );
      const texto = valorCampo.trim();
      const caracteres = Array.from(texto).length;
      const sinSaltos =
        campo === 'referencia' ? texto.replace(/[\r\n]/g, '') : texto;
      if (
        caracteres < minimo ||
        caracteres > maximo ||
        /[\p{Cc}\p{Cf}]/u.test(sinSaltos)
      )
        throw new BadRequestException(
          'Revisa la longitud y el contenido de los campos de la dirección.',
        );
      resultado[campo] = texto;
    }
    if (
      typeof resultado.celular === 'string' &&
      !/^9[0-9]{8}$/.test(resultado.celular)
    )
      throw new BadRequestException(
        'Ingresa un celular de nueve dígitos que empiece con 9.',
      );
    if (
      typeof resultado.distrito === 'string' &&
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultado.distrito)
    )
      throw new BadRequestException('El código de distrito no es válido.');
    if (Object.hasOwn(datos, 'predeterminada')) {
      if (typeof datos.predeterminada !== 'boolean')
        throw new BadRequestException(
          'La dirección predeterminada debe indicarse con un booleano.',
        );
      resultado.predeterminada = datos.predeterminada;
    } else if (this.modo === 'crear') resultado.predeterminada = false;
    return resultado as unknown as CrearDireccionDto | ActualizarDireccionDto;
  }
}
