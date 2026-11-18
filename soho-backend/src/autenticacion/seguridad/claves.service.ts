import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

@Injectable()
export class ClavesService {
  private readonly ficticio = this.crear(randomBytes(32).toString('base64url'));

  crear(clave: string): Promise<string> {
    return hash(clave, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  }

  async verificar(
    claveHash: string | null | undefined,
    clave: string,
  ): Promise<boolean> {
    // También se ejecuta Argon2 cuando no existe cuenta o no tiene clave local.
    // Los límites evitan costes descontrolados si se importa un hash incorrecto.
    const parametros = claveHash?.match(
      /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/,
    );
    const utilizable =
      !!parametros &&
      claveHash!.length <= 255 &&
      +parametros[1] >= 8192 &&
      +parametros[1] <= 262144 &&
      +parametros[2] >= 1 &&
      +parametros[2] <= 10 &&
      +parametros[3] >= 1 &&
      +parametros[3] <= 8;
    const valor = utilizable ? claveHash! : await this.ficticio;
    try {
      return (await verify(valor, clave)) && utilizable;
    } catch {
      return false;
    }
  }
}
