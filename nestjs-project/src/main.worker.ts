import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { VideoWorkerModule } from './video-worker/video-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(VideoWorkerModule);
  app.enableShutdownHooks();
  await app.init();
  Logger.log('Video worker ready', 'Bootstrap');
}

void bootstrap();
