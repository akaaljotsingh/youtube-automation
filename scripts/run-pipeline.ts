import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PipelineService } from '../src/modules/pipeline/pipeline.service';
import { logger } from '../src/common/logger';

async function main() {
  const channelKey = process.argv.find((a) => a.startsWith('--channel='))?.split('=')[1] ?? 'american-curiosity';
  const dryRun = process.env.DRY_RUN === 'true';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pipeline = app.get(PipelineService);

  logger.info({ channelKey, dryRun }, 'manual pipeline start');
  const id = await pipeline.runFullPipeline(channelKey, dryRun);
  logger.info({ id }, 'manual pipeline complete');
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'pipeline crashed');
  process.exit(1);
});