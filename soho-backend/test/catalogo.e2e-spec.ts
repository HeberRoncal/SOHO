import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CatalogoService } from '../src/catalogo/catalogo.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma } from '../src/generated/prisma/client.js';

describe('Errores HTTP del catálogo sin base de datos', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [CatalogoModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(CatalogoService)
      .useValue({
        listar: () =>
          Promise.reject(
            new Prisma.PrismaClientKnownRequestError(
              'SQL privado y detalles internos',
              { code: 'P1001', clientVersion: '7.10.1' },
            ),
          ),
      })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('rechaza los parámetros antes de intentar acceder a la base', async () => {
    await request(app.getHttpServer())
      .get('/api/productos?limite=101')
      .expect(400);
  });
  it('devuelve un 503 recuperable sin publicar SQL ni detalles internos', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/productos')
      .expect(503);
    expect(respuesta.body.message).toContain('Inténtalo nuevamente');
    expect(JSON.stringify(respuesta.body)).not.toContain('SQL privado');
  });
});
