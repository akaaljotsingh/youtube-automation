import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfig } from '@nestjs/config';
import { envSchema } from './config.schema';

@Global()
@Module({
  imports: [
    NestConfig.forRoot({
      isGlobal: true,
      validate: (raw) => {
        const parsed = envSchema.safeParse(raw);
        if (!parsed.success) {
          // eslint-disable-next-line no-console
          console.error('❌ Invalid environment', parsed.error.flatten().fieldErrors);
          throw new Error('Invalid environment');
        }
        return parsed.data;
      },
    }),
  ],
})
export class ConfigModule {}