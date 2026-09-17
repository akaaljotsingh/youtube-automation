import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRetry } from '../../common/retry';

export interface ImageRequest {
  prompt: string;
  aspectRatio?: '16:9' | '1:1' | '9:16';
}

@Injectable()
export class ImageService {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(private readonly cfg: ConfigService) {}

  async generate(req: ImageRequest, outPath: string): Promise<void> {
    const model = this.cfg.getOrThrow<string>('GEMINI_IMAGE_MODEL');
    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: req.aspectRatio ?? '16:9' },
      },
    };

    const res = await withRetry(
      async () => {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.cfg.getOrThrow<string>('GEMINI_API_KEY'),
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`Image ${r.status}: ${await r.text()}`);
        return (await r.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> } }>;
        };
      },
      { label: 'image.generate' },
    );

    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) throw new Error('Image: no inline data returned');

    const { writeFile } = await import('node:fs/promises');
    await writeFile(outPath, Buffer.from(part.inlineData.data, 'base64'));
  }
}