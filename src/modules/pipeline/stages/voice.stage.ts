import { Injectable } from '@nestjs/common';
import { TtsService } from '../../ai/tts.service';
import type { Script } from './script.stage';

@Injectable()
export class VoiceStage {
  constructor(private readonly tts: TtsService) {}

  async run(script: Script, outPath: string): Promise<void> {
    const narration = [
      script.hook,
      ...script.sections.map((s) => s.narration),
      script.closing,
    ].join('\n\n');

    await this.tts.synthesize({ text: narration }, outPath);
  }
}