import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AppModule } from './app.module';
import { PipelineService } from './modules/pipeline/pipeline.service';
import { logger } from './common/logger';
import { PIPELINE_QUEUE, type PipelineJob } from './modules/jobs/jobs.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pipeline = app.get(PipelineService);
  const redisUrl = process.env.REDIS_URL!;
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

  const worker = new Worker<PipelineJob>(
    PIPELINE_QUEUE,
    async (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'worker picked up job');
      await pipeline.runFullPipeline(job.data.channelKey, job.data.dryRun ?? false);
    },
    { connection, concurrency },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'job failed');
  });

  logger.info({ concurrency }, 'worker started');
}

bootstrap().catch((err) => {
  logger.fatal({ err: err.message }, 'worker crashed');
  process.exit(1);
});