import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // NestFactory.create resolves the Mongoose connection. If Mongo is
  // unreachable this throws, we log it and exit non-zero.
  const app = await NestFactory.create(AppModule);

  // Local dev tool, no auth - the frontend runs on a different port.
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  const connection = app.get<Connection>(getConnectionToken());
  // readyState 1 = connected
  logger.log(
    `MongoDB connected: ${connection.host}:${connection.port}/${connection.name} (readyState=${connection.readyState})`,
  );
  connection.on('disconnected', () => logger.error('MongoDB disconnected'));
  connection.on('reconnected', () => logger.log('MongoDB reconnected'));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  new Logger('Bootstrap').error(`Startup failed: ${message}`);
  process.exit(1);
});
