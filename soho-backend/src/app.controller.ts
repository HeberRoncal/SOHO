import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Publico } from './autenticacion/seguridad/auth.decoradores.js';

@Controller()
@Publico()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
