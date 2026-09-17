import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRetry } from '../../common/retry';

export interface TtsRequest {
  text: string;
  voice?: string;
  style?: string;
}

@Injectable()
export class TtsService {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(private readonly cfg: ConfigService) {}

  async synthesize(req: TtsRequest, outPath: string): Promise<void> {
    const model = this.cfg.getOrThrow<string>('TTS_MODEL');
    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Read the following in a calm, intelligent documentary tone. Return ONLY audio.\n\n${req.text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice ?? 'Kore' } },
        },
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
        if (!r.ok) throw new Error(`TTS ${r.status}: ${await r.text()}`);
        return (await r.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> } }>;
        };
      },
      { label: 'tts.synthesize' },
    );

    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) throw new Error('TTS: no audio data');

    const { writeFile } = await import('node:fs/promises');
    // Gemini TTS returns PCM (16-bit LE mono 24kHz). Wrap into WAV.
    const pcm = Buffer.from(part.inlineData.data, 'base64');
    const wav = pcmToWav(pcm, 24_000, 1, 16);
    await writeFile(outPath, wav);
  }
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bits: number): Buffer {
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}