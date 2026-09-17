import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { logger } from '../../common/logger';

@Injectable()
export class SchedulerService {
  constructor(private readonly prisma: PrismaService, private readonly jobs: JobsService) {}

  @Cron('0 0 6 * * *', { name: 'daily-pipeline' })
  async daily(): Promise<void> {
    const channels = await this.prisma.channel.findMany();
    for (const c of channels) {
      logger.info({ channel: c.key }, 'enqueue daily');
      await this.jobs.enqueueDaily(c.key);
    }
  }
}