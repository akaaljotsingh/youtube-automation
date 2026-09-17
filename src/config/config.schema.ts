import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  GCP_PROJECT_ID: z.string(),
  GCS_BUCKET: z.string(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  GEMINI_API_KEY: z.string().min(1),
GEMINI_TEXT_MODEL: z.string().default('gemini-3.8-flash'),
GEMINI_SEARCH_MODEL: z.string().default('gemini-3.8-flash'),
GEMINI_IMAGE_MODEL: z.string().default('gemini-3.1-flash-image'),
VEO_MODEL: z.string().default('veo-3.1-fast-generate-preview'),
TTS_MODEL: z.string().default('gemini-3.1-flash-tts-preview'),
  VEO_RESOLUTION: z.enum(['720p', '1080p']).default('720p'),

  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  DRY_RUN: z.coerce.boolean().default(false),
  AUTO_PUBLISH: z.coerce.boolean().default(false),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export type AppConfig = z.infer<typeof envSchema>;