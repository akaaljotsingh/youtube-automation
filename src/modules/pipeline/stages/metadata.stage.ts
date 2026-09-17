import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeminiService } from '../../ai/gemini.service';
import type { Script } from './script.stage';

export interface Metadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

@Injectable()
export class MetadataStage {
  constructor(private readonly gemini: GeminiService) {}

  async run(script: Script, topic: string): Promise<Metadata> {
    const template = await readFile(join(__dirname, '../../../prompts/metadata.md'), 'utf8');
    const summary = script.sections.map((s) => s.narration).join(' ').slice(0, 800);
    const prompt = template
      .replace('{{TITLE}}', script.title)
      .replace('{{TOPIC}}', topic)
      .replace('{{SUMMARY}}', summary);

    return this.gemini.generateJson<Metadata>({ prompt, temperature: 0.6 });
  }
}