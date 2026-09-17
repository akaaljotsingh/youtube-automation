import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PipelineService } from '../src/modules/pipeline/pipeline.service';
import { PrismaService } from '../src/database/prisma.service';
import { GcsService } from '../src/modules/storage/gcs.service';
import { YoutubeService } from '../src/modules/youtube/youtube.service';
import { VeoService } from '../src/modules/ai/veo.service';
import { ImageService } from '../src/modules/ai/image.service';

describe('Pipeline (dry-run, mocked providers)', () => {
  let pipeline: PipelineService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VeoService)
      .useValue({ generate: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(ImageService)
      .useValue({ generate: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(GcsService)
      .useValue({
        upload: jest.fn(async (_l: string, r: string) => `gs://test/${r}`),
      })
      .overrideProvider(YoutubeService)
      .useValue({ upload: jest.fn().mockResolvedValue('fakeId') })
      .compile();

    const prisma = moduleRef.get(PrismaService);
    await prisma.channel.upsert({
      where: { key: 'test-channel' },
      update: {},
      create: {
        key: 'test-channel',
        name: 'Test',
        niche: 'test',
        config: { style: {} },
      },
    });

    pipeline = moduleRef.get(PipelineService);
  });

  it('runs without throwing in DRY_RUN mode (mocked AI)', async () => {
    // NOTE: this test exercises the orchestration, not the actual AI calls.
    // It requires real GEMINI_API_KEY for stages that call the real Gemini client.
    // Skip in CI unless GEMINI_API_KEY is set.
    if (!process.env.GEMINI_API_KEY) return;
    const id = await pipeline.runFullPipeline('test-channel', true);
    expect(id).toBeTruthy();
  }, 600_000);
});