import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { withRetry } from '../../common/retry';

export interface GenerateJsonOptions {
  system?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  useSearch?: boolean;
}

@Injectable()
export class GeminiService {
  private readonly client: GoogleGenerativeAI;

  constructor(private readonly cfg: ConfigService) {
    this.client = new GoogleGenerativeAI(this.cfg.getOrThrow<string>('GEMINI_API_KEY'));
  }

private model(name: string, useSearch: boolean, system?: string): GenerativeModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = { model: name };
  if (system) params.systemInstruction = system;
  if (useSearch) params.tools = [{ googleSearch: {} }];
  return this.client.getGenerativeModel(params);
}

  async generateText(opts: GenerateJsonOptions): Promise<string> {
    const modelName = opts.model ?? this.cfg.getOrThrow<string>('GEMINI_TEXT_MODEL');
    const m = this.model(modelName, opts.useSearch ?? false, opts.system);

    const res = await withRetry(
      () =>
        m.generateContent({
          contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.7,
            responseMimeType: 'text/plain',
          },
        }),
      { label: 'gemini.generateText' },
    );

    return res.response.text();
  }

  async generateJson<T>(opts: GenerateJsonOptions): Promise<T> {
    const modelName = opts.model ?? this.cfg.getOrThrow<string>('GEMINI_TEXT_MODEL');
    const m = this.model(modelName, opts.useSearch ?? false, opts.system);

    const res = await withRetry(
      () =>
        m.generateContent({
          contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.4,
            responseMimeType: 'application/json',
          },
        }),
      { label: 'gemini.generateJson' },
    );

    const text = res.response.text();
    return JSON.parse(text) as T;
  }
}