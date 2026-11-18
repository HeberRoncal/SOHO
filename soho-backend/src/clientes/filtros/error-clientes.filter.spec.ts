import { ErrorClientesFilter } from './error-clientes.filter.js';
import type { ArgumentsHost } from '@nestjs/common';

describe('Error de persistencia de Clientes', () => {
  it('devuelve 503 recuperable sin SQL ni datos sensibles', () => {
    const json = vi.fn(),
      status = vi.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
    new ErrorClientesFilter().catch(
      new Error('SELECT clave_hash secreto'),
      host as unknown as ArgumentsHost,
    );
    expect(status).toHaveBeenCalledWith(503);
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 503 });
    expect(JSON.stringify(json.mock.calls)).not.toMatch(
      /clave_hash|SELECT|secreto/,
    );
  });
});
