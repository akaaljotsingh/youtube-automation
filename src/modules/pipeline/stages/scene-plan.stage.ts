import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeminiService } from '../../ai/gemini.service';
import type { Script } from './script.stage';

export interface ScenePlan {
  index: number;
  duration: number;
  narration: string;
  visualKind: 'veo' | 'image' | 'chart';
  prompt: string;
  camera?: string;
  style?: string;
}

@Injectable()
export class ScenePlanStage {
  constructor(private readonly gemini: GeminiService) {}

  async run(script: Script, targetDurationSeconds: number): Promise<ScenePlan[]> {
    const template = await readFile(join(__dirname, '../../../prompts/scene-planner.md'), 'utf8');
    const prompt = template
      .replace('{{SCRIPT}}', JSON.stringify(script, null, 2))
      .replace('{{DURATION}}', String(targetDurationSeconds));

    const res = await this.gemini.generateJson<{ scenes: ScenePlan[] }>({ prompt, temperature: 0.5 });
    if (!res.scenes?.length) throw new Error('ScenePlanStage: no scenes');
    return res.scenes;
  }
}