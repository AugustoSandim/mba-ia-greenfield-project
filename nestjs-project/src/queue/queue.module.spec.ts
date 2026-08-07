import { Test } from '@nestjs/testing';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigType } from '@nestjs/config';
import queueConfig from '../config/queue.config';
import { QueueModule } from './queue.module';
import { QueueService } from './queue.service';

describe('QueueModule', () => {
  it('should compile successfully', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        BullModule.forRootAsync({
          inject: [queueConfig.KEY],
          useFactory: (cfg: ConfigType<typeof queueConfig>) => ({
            connection: { host: cfg.host, port: cfg.port },
          }),
        }),
        QueueModule,
      ],
    }).compile();

    expect(module.get(QueueService)).toBeDefined();
    await module.close();
  }, 30000);
});
