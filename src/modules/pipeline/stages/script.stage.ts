import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeminiService } from '../../ai/gemini.service';
import type { Research } from './research.stage';

export interface Script {
  title: string;
  hook: string;
  sections: Array<{ heading: string; narration: string }>;
  closing: string;
  estimatedDurationSeconds: number;
}

@Injectable()
export class ScriptStage {
  constructor(private readonly gemini: GeminiService) {}

  async run(research: Research, style: Record<string, unknown>): Promise<Script> {
    const template = await readFile(join(__dirname, '../../../prompts/script.md'), 'utf8');
    const prompt = template
      .replace('{{STYLE}}', JSON.stringify(style))
      .replace('{{RESEARCH}}', JSON.stringify(research, null, 2));

    return this.gemini.generateJson<Script>({ prompt, temperature: 0.7 });
  }
}