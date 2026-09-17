import { Global, Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { VeoService } from './veo.service';
import { ImageService } from './image.service';
import { TtsService } from './tts.service';

@Global()
@Module({
  providers: [GeminiService, VeoService, ImageService, TtsService],
  exports: [GeminiService, VeoService, ImageService, TtsService],
})
export class AiModule {}