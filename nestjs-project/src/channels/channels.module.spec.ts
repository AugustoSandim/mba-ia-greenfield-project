import { Test } from '@nestjs/testing';
import { createSocialModuleSpecImports } from '../test/create-test-data-source';
import { ChannelsModule } from './channels.module';

describe('ChannelsModule', () => {
  it('should compile with TypeOrmModule.forFeature([Channel]) and ChannelsService', async () => {
    const module = await Test.createTestingModule({
      imports: [...createSocialModuleSpecImports(), ChannelsModule],
    }).compile();

    expect(module).toBeDefined();
    await module.close();
  }, 30000);
});
