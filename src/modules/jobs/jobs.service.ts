import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const PIPELINE_QUEUE = 'pipeline';

export interface PipelineJob {
  channelKey: string;
  dryRun?: boolean;
}

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly connection: IORedis;
  readonly queue: Queue<PipelineJob>;

  constructor(cfg: ConfigService) {
    this.connection = new IORedis(cfg.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<PipelineJob>(PIPELINE_QUEUE, { connection: this.connection });
  }

  async enqueueDaily(channelKey: string, dryRun = false): Promise<void> {
    await this.queue.add(
      'PIPELINE_RUN',
      { channelKey, dryRun },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
        jobId: `daily-${channelKey}-${new Date().toISOString().slice(0, 10)}`,
      },
    );
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}