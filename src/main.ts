import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PipelineService } from './modules/pipeline/pipeline.service';
import { JobsService } from './modules/jobs/jobs.service';
import { logger } from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const pipeline = app.get(PipelineService);
  const jobs = app.get(JobsService);

  // HTTP endpoints for Cloud Scheduler / manual triggers
  const http = app.getHttpAdapter().getInstance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http.post('/jobs/daily', async (req: any, res: any) => {
    const channelKey = req.body?.channelKey ?? 'american-curiosity';
    await jobs.enqueueDaily(channelKey);
    res.json({ ok: true });
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http.post('/jobs/run', async (req: any, res: any) => {
    const channelKey = req.body?.channelKey ?? 'american-curiosity';
    const dryRun = req.body?.dryRun ?? false;
    const id = await pipeline.runFullPipeline(channelKey, dryRun);
    res.json({ ok: true, videoId: id });
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http.get('/health', (_req: any, res: any) => res.json({ ok: true }));

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
  logger.info({ port }, 'api listening');
}

bootstrap().catch((err) => {
  logger.fatal({ err: err.message }, 'bootstrap failed');
  process.exit(1);
});