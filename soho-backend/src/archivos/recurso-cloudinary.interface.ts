import type {
  ArchivoImagen,
  ArchivoQrPago,
} from '../generated/prisma/client.js';

/** Identidad persistida; el transporte comparte configuración, firma y verificación. */
export type RecursoCloudinary = ArchivoImagen | ArchivoQrPago;
