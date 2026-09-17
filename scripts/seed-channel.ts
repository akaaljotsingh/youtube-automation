import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  await prisma.channel.upsert({
    where: { key: 'american-curiosity' },
    update: {},
    create: {
      key: 'american-curiosity',
      name: 'American Curiosity',
      niche: 'American business, consumer behavior, and forgotten infrastructure documentaries',
      language: 'en',
      timezone: 'America/New_York',
      publishHour: 18,
      config: {
        style: {
          voice: { tone: 'calm, intelligent, curious', pace: 'moderate' },
          visual: { color: 'cinematic', camera: 'slow controlled movement', realism: 'high' },
          writing: {
            sentenceLength: 'short-medium',
            avoid: ['generic hooks', 'AI-sounding phrases', 'overdramatic language'],
          },
        },
      },
    },
  });

  console.log('✔ channel seeded');
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});