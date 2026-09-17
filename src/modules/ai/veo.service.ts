import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRetry } from '../../common/retry';
import { logger } from '../../common/logger';

export interface VeoGenerateRequest {
  prompt: string;
  durationSeconds: 4 | 6 | 8;
  aspectRatio: '16:9' | '9:16';
  resolution: '720p' | '1080p';
  negativePrompt?: string;
  seed?: number;
}

export interface VeoOperationResult {
  operationName: string;
}

@Injectable()
export class VeoService {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(private readonly cfg: ConfigService) {}

  private headers() {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.cfg.getOrThrow<string>('GEMINI_API_KEY'),
    };
  }

  async startGeneration(req: VeoGenerateRequest): Promise<VeoOperationResult> {
    const model = this.cfg.getOrThrow<string>('VEO_MODEL');
    const url = `${this.baseUrl}/models/${model}:predictLongRunning`;

    const body = {
      instances: [{ prompt: req.prompt }],
      parameters: {
        aspectRatio: req.aspectRatio,
        resolution: req.resolution,
        durationSeconds: req.durationSeconds,
        negativePrompt: req.negativePrompt,
        seed: req.seed,
      },
    };

    const res = await withRetry(
      async () => {
        const r = await fetch(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`Veo start ${r.status}: ${await r.text()}`);
        return (await r.json()) as { name: string };
      },
      { label: 'veo.start' },
    );

    return { operationName: res.name };
  }

  async pollOperation(operationName: string, timeoutMs = 10 * 60 * 1000): Promise<string> {
    const started = Date.now();
    const url = `${this.baseUrl}/${operationName}`;

    while (Date.now() - started < timeoutMs) {
      const r = await fetch(url, { headers: this.headers() });
      if (!r.ok) throw new Error(`Veo poll ${r.status}: ${await r.text()}`);
      const json = (await r.json()) as {
        done?: boolean;
        error?: { message: string };
        response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
      };

      if (json.error) throw new Error(`Veo error: ${json.error.message}`);
      if (json.done) {
        const uri = json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!uri) throw new Error('Veo returned no video URI');
        return uri;
      }

      await new Promise((r) => setTimeout(r, 5_000));
      logger.debug({ operationName }, 'veo polling');
    }

    throw new Error('Veo operation timed out');
  }

  async downloadVideo(uri: string, outPath: string): Promise<void> {
    const res = await fetch(uri, { headers: this.headers() });
    if (!res.ok) throw new Error(`Veo download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outPath, buf);
  }

  async generate(req: VeoGenerateRequest, outPath: string): Promise<void> {
    const { operationName } = await this.startGeneration(req);
    const uri = await this.pollOperation(operationName);
    await this.downloadVideo(uri, outPath);
  }
}