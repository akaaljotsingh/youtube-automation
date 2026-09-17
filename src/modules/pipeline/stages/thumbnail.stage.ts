import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeminiService } from '../../ai/gemini.service';
import { ImageService } from '../../ai/image.service';

@Injectable()
export class ThumbnailStage {
  constructor(private readonly gemini: GeminiService, private readonly image: ImageService) {}

  async run(title: string, topic: string, outPath: string): Promise<void> {
    const template = await readFile(join(__dirname, '../../../prompts/thumbnail.md'), 'utf8');
    const prompt = template.replace('{{TITLE}}', title).replace('{{TOPIC}}', topic);

    const concept = await this.gemini.generateJson<{
      imagePrompt: string;
      overlayText: string;
      composition: string;
    }>({ prompt, temperature: 0.7 });

    const finalPrompt = `${concept.imagePrompt}. Overlay the text "${concept.overlayText}" in bold, high-contrast sans-serif at the bottom-left. Cinematic color grading, dramatic lighting, YouTube thumbnail composition, no watermark.`;

    await this.image.generate({ prompt: finalPrompt, aspectRatio: '16:9' }, outPath);
  }
}