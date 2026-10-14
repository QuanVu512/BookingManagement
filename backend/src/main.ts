import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { REQUEST_VALIDATION_OPTIONS } from './constants/validation.constants.js';
import { resolveWebOrigin } from './modules/auth/helpers/auth-config.js';
import { resolveTrustedProxy } from './modules/auth/helpers/auth-config.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.set('trust proxy', resolveTrustedProxy(configService));
  app.enableCors({
    origin: resolveWebOrigin(configService),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe(REQUEST_VALIDATION_OPTIONS));
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pickleball Booking API')
    .setDescription('Base API documentation')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();
  await app.listen(configService.get<number>('PORT', 3000), '0.0.0.0');
}
await bootstrap();
