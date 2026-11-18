import { Module } from '@nestjs/common';
import { CloudinaryService } from '../productos/fotografias/cloudinary.service.js';
import {
  ConfiguracionCloudinary,
  HTTP_CLOUDINARY,
} from '../productos/fotografias/configuracion-cloudinary.js';

@Module({
  providers: [
    CloudinaryService,
    {
      provide: ConfiguracionCloudinary,
      useFactory: () => new ConfiguracionCloudinary(),
    },
    { provide: HTTP_CLOUDINARY, useFactory: () => fetch },
  ],
  exports: [CloudinaryService, ConfiguracionCloudinary],
})
export class CloudinaryModule {}
