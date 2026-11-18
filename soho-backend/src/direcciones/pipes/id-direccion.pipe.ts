import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';

@Injectable()
export class IdDireccionPipe extends ParseUUIDPipe {
  constructor() {
    super({
      version: '4',
      exceptionFactory: () =>
        new BadRequestException('El identificador de dirección no es válido.'),
    });
  }
}
