import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { REQUEST_VALIDATION_OPTIONS } from './constants/validation.constants.js';
import { resolveWebOrigin } from './modules/auth/helpers/auth-config.js';
import { resolveTrustedProxy } from './modules/auth/helpers/auth-config.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { securityHeaders } from './common/security-http.js';
import { AuthAuditMiddleware } from './modules/auth/presentation/auth-audit.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  const audit = app.get(AuthAuditMiddleware);
  app.use(audit.use.bind(audit));
  app.set('trust proxy', resolveTrustedProxy(configService));
  app.enableCors({
    origin: resolveWebOrigin(configService),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe(REQUEST_VALIDATION_OPTIONS));
  if (configService.get<string>('NODE_ENV') !== 'production') setupSwagger(app);

  app.enableShutdownHooks();
  await app.listen(configService.get<number>('PORT', 3000), '0.0.0.0');
}

function setupSwagger(app: NestExpressApplication): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pickleball Booking API')
    .setDescription('Base API documentation')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
await bootstrap();
