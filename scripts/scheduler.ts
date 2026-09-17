import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { logger } from '../src/common/logger';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  logger.info('scheduler running (Ctrl+C to exit)');
  // Nest ScheduleModule keeps the process alive
  process.stdin.resume();
  process.on('SIGINT', async () => {
    await app.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'scheduler crashed');
  process.exit(1);
});