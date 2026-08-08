import { Test } from '@nestjs/testing';
import { createSocialModuleSpecImports } from '../test/create-test-data-source';
import { UsersModule } from './users.module';

describe('UsersModule', () => {
  it('should compile successfully', async () => {
    const module = await Test.createTestingModule({
      imports: [...createSocialModuleSpecImports(), UsersModule],
    }).compile();

    expect(module).toBeDefined();
    await module.close();
  }, 30000);
});
