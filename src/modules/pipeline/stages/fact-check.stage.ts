import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeminiService } from '../../ai/gemini.service';
import type { Research } from './research.stage';
import type { Script } from './script.stage';

export interface FactCheck {
  verdicts: Array<{
    claim: string;
    status: 'SUPPORTED' | 'UNSUPPORTED' | 'NEEDS_REVIEW' | 'CONTRADICTED';
    explanation: string;
    replacement?: string;
  }>;
  unsupportedCount: number;
  summary: string;
}

@Injectable()
export class FactCheckStage {
  constructor(private readonly gemini: GeminiService) {}

  async run(research: Research, script: Script): Promise<FactCheck> {
    const template = await readFile(join(__dirname, '../../../prompts/fact-check.md'), 'utf8');
    const prompt = template
      .replace('{{RESEARCH}}', JSON.stringify(research, null, 2))
      .replace('{{SCRIPT}}', JSON.stringify(script, null, 2));

    return this.gemini.generateJson<FactCheck>({ prompt, temperature: 0.2 });
  }
}