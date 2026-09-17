import { Injectable } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { VeoService } from '../../ai/veo.service';
import { ImageService } from '../../ai/image.service';
import type { ScenePlan } from './scene-plan.stage';
import { logger } from '../../../common/logger';

@Injectable()
export class AssetStage {
  constructor(private readonly veo: VeoService, private readonly image: ImageService) {}

  async run(scene: ScenePlan, workDir: string): Promise<string> {
    await mkdir(workDir, { recursive: true });
    const fileName = `scene-${scene.index.toString().padStart(3, '0')}`;

    if (scene.visualKind === 'veo') {
      const out = join(workDir, `${fileName}.mp4`);
      const duration = Math.min(8, Math.max(4, scene.duration)) as 4 | 6 | 8;
      logger.info({ scene: scene.index, duration }, 'veo generating');
      await this.veo.generate(
        {
          prompt: scene.prompt,
          durationSeconds: duration,
          aspectRatio: '16:9',
          resolution: (process.env.VEO_RESOLUTION as '720p' | '1080p') ?? '720p',
        },
        out,
      );
      return out;
    }

    const out = join(workDir, `${fileName}.png`);
    await this.image.generate({ prompt: scene.prompt, aspectRatio: '16:9' }, out);
    return out;
  }
}