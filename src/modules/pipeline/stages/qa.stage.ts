import { Injectable } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { GeminiService } from '../../ai/gemini.service';
import type { Script } from './script.stage';
import type { FactCheck } from './fact-check.stage';
import { logger } from '../../../common/logger';

export interface QaResult {
  ok: boolean;
  reasons: string[];
}

@Injectable()
export class QaStage {
  constructor(private readonly gemini: GeminiService) {}

  async technicalCheck(videoPath: string, thumbnailPath: string): Promise<QaResult> {
    const reasons: string[] = [];
    try {
      const v = await stat(videoPath);
      if (v.size < 1_000_000) reasons.push(`video too small (${v.size}b)`);
    } catch {
      reasons.push('video missing');
    }
    try {
      const t = await stat(thumbnailPath);
      if (t.size < 5_000) reasons.push(`thumbnail too small (${t.size}b)`);
    } catch {
      reasons.push('thumbnail missing');
    }
    return { ok: reasons.length === 0, reasons };
  }

  async contentCheck(script: Script, factCheck: FactCheck): Promise<QaResult> {
    const reasons: string[] = [];
    if (factCheck.unsupportedCount > 0) reasons.push(`unsupported claims: ${factCheck.unsupportedCount}`);

    const fullText = [script.hook, ...script.sections.map((s) => s.narration), script.closing].join('\n');
    const words = fullText.split(/\s+/).length;
    if (words < 900) reasons.push(`too short: ${words} words`);

    const aiCheck = await this.gemini.generateJson<{ problems: string[] }>({
      temperature: 0,
      prompt:
        `Review this narration for obvious errors, repeated sentences, and broken grammar. ` +
        `Return JSON: {"problems": ["..."]}. Empty array if clean.\n\n${fullText.slice(0, 12_000)}`,
    });
    if (aiCheck.problems?.length) reasons.push(...aiCheck.problems.slice(0, 5));

    logger.info({ reasons }, 'qa content check');
    return { ok: reasons.length === 0, reasons };
  }
}