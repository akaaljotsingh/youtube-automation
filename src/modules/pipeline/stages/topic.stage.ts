import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeminiService } from '../../ai/gemini.service';
import { PrismaService } from '../../../database/prisma.service';

export interface TopicCandidate {
  topic: string;
  workingTitle: string;
  coreQuestion: string;
  whyViewersCare: string;
  researchability: number;
  visualPotential: number;
  evergreenScore: number;
}

@Injectable()
export class TopicStage {
  constructor(private readonly gemini: GeminiService, private readonly prisma: PrismaService) {}

  async run(channelKey: string): Promise<TopicCandidate> {
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { key: channelKey } });
    const previous = await this.prisma.video.findMany({
      where: { channelId: channel.id },
      select: { topic: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    const promptPath = join(__dirname, '../../../prompts/topic-discovery.md');
    const template = await readFile(promptPath, 'utf8');
    const prompt = template
      .replace('{{CHANNEL_NAME}}', channel.name)
      .replace('{{NICHE}}', channel.niche)
      .replace('{{LANGUAGE}}', channel.language)
      .replace('{{PREVIOUS}}', previous.map((p) => `- ${p.topic}`).join('\n') || '(none)');

    const res = await this.gemini.generateJson<{ candidates: TopicCandidate[] }>({
      prompt,
      temperature: 0.9,
    });

    if (!res.candidates?.length) throw new Error('TopicStage: no candidates');

    const scored = res.candidates
      .map((c) => ({
        c,
        score:
          c.researchability * 0.35 +
          c.visualPotential * 0.35 +
          c.evergreenScore * 0.3,
      }))
      .sort((a, b) => b.score - a.score);

    return scored[0]!.c;
  }
}