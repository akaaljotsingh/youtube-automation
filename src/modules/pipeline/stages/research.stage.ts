import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeminiService } from '../../ai/gemini.service';

export interface Research {
  topic: string;
  summary: string;
  claims: Array<{
    claim: string;
    source: { url: string; publisher: string; title: string };
    confidence: 'high' | 'medium' | 'low';
  }>;
  statistics: Array<{ value: string; context: string; sourceUrl: string }>;
  timeline: Array<{ date: string; event: string }>;
  contradictions: Array<{ description: string; sources: string[] }>;
  people: string[];
  places: string[];
}

@Injectable()
export class ResearchStage {
  constructor(private readonly gemini: GeminiService) {}

  async run(topic: string): Promise<Research> {
    const template = await readFile(join(__dirname, '../../../prompts/research.md'), 'utf8');
    const prompt = template.replace('{{TOPIC}}', topic);

    return this.gemini.generateJson<Research>({
      prompt,
      useSearch: true,
model: process.env.GEMINI_SEARCH_MODEL ?? 'gemini-3.8-flash',
      temperature: 0.3,
    });
  }
}