import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';

@Injectable()
export class CodigoZonaPipe implements PipeTransform<unknown, string> {
  transform(valor: unknown): string {
    if (
      typeof valor !== 'string' ||
      valor.length > 80 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(valor) ||
      /[^a-z0-9-]/.test(valor)
    )
      throw new BadRequestException('El código de distrito no es válido.');
    return valor;
  }
}
