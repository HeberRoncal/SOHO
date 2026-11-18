import { SetMetadata } from '@nestjs/common';
export const FORMATO_MULTIPART_CSRF = Symbol('FORMATO_MULTIPART_CSRF');
export const MultipartCsrf = () => SetMetadata(FORMATO_MULTIPART_CSRF, true);
