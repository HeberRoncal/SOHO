import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  CONFIGURACION_AUTH,
  crearConfiguracionAuth,
} from './seguridad/configuracion-auth.js';
import { AutenticacionController } from './acceso/autenticacion.controller.js';
import { AutenticacionService } from './acceso/autenticacion.service.js';
import { ClavesService } from './seguridad/claves.service.js';
import { CsrfService } from './seguridad/csrf.service.js';
import { SesionesService } from './sesiones/sesiones.service.js';
import { LimitesAuthService } from './seguridad/limites-auth.service.js';
import {
  AutenticacionGuard,
  CsrfGuard,
  LimiteAccesoGuard,
  RolesGuard,
} from './seguridad/auth.guards.js';
import { ErroresAuthFilter } from './seguridad/errores-auth.filter.js';
import { GoogleController } from './google/google.controller.js';
import { GoogleService } from './google/google.service.js';
import { DesafiosGoogleService } from './google/desafios-google.service.js';
import { VerificadorGoogleService } from './google/verificador-google.service.js';
import {
  CONFIGURACION_CORREO,
  crearConfiguracionCorreo,
} from './correo/configuracion-correo.js';
import { CorreosService } from './correo/correos.service.js';
import { RecuperacionService } from './recuperacion/recuperacion.service.js';
import { RecuperacionController } from './recuperacion/recuperacion.controller.js';
import { VerificacionService } from './verificacion/verificacion.service.js';
import { VerificacionController } from './verificacion/verificacion.controller.js';
import { EscrituraAutorizadaService } from './seguridad/escritura-autorizada.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    AutenticacionController,
    GoogleController,
    RecuperacionController,
    VerificacionController,
  ],
  providers: [
    { provide: CONFIGURACION_AUTH, useFactory: () => crearConfiguracionAuth() },
    {
      provide: CONFIGURACION_CORREO,
      inject: [CONFIGURACION_AUTH],
      useFactory: (
        config: import('./seguridad/configuracion-auth.js').ConfiguracionAuth,
      ) => crearConfiguracionCorreo(process.env, config.origenes),
    },
    ClavesService,
    CsrfService,
    SesionesService,
    AutenticacionService,
    LimitesAuthService,
    GoogleService,
    DesafiosGoogleService,
    VerificadorGoogleService,
    CorreosService,
    RecuperacionService,
    VerificacionService,
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: LimiteAccesoGuard },
    { provide: APP_FILTER, useClass: ErroresAuthFilter },
    EscrituraAutorizadaService,
  ],
  exports: [
    AutenticacionService,
    ClavesService,
    SesionesService,
    CsrfService,
    LimitesAuthService,
    CONFIGURACION_AUTH,
    EscrituraAutorizadaService,
  ],
})
export class AutenticacionModule {}
