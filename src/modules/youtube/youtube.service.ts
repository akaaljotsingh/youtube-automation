import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3 } from 'googleapis';
import { createReadStream, statSync } from 'node:fs';
import { withRetry } from '../../common/retry';
import { logger } from '../../common/logger';

export interface UploadInput {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  publishAt?: Date;
  thumbnailPath?: string;
}

@Injectable()
export class YoutubeService {
  private readonly yt: youtube_v3.Youtube | null;
  private readonly enabled: boolean;

  constructor(private readonly cfg: ConfigService) {
    const clientId = cfg.get<string>('YOUTUBE_CLIENT_ID') ?? '';
    const clientSecret = cfg.get<string>('YOUTUBE_CLIENT_SECRET') ?? '';
    const refreshToken = cfg.get<string>('YOUTUBE_REFRESH_TOKEN') ?? '';

    if (!clientId || !clientSecret || !refreshToken) {
      logger.warn(
        'YouTube credentials not configured — uploads disabled. Set YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN to enable.',
      );
      this.yt = null;
      this.enabled = false;
      return;
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    this.yt = google.youtube({ version: 'v3', auth });
    this.enabled = true;
    logger.info('YouTube client initialized');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async upload(input: UploadInput): Promise<string> {
    if (!this.yt) {
      throw new Error(
        'YouTube upload requested but credentials are missing. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in .env',
      );
    }

    const size = statSync(input.videoPath).size;

    const res = await withRetry(
      () =>
        this.yt!.videos.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: input.title,
              description: input.description,
              tags: input.tags,
              categoryId: input.categoryId ?? '27',
            },
            status: {
              privacyStatus: input.privacyStatus,
              selfDeclaredMadeForKids: false,
              publishAt: input.publishAt?.toISOString(),
            },
          },
          media: { body: createReadStream(input.videoPath) },
        }),
      {
        attempts: 3,
        baseDelayMs: 5_000,
        label: 'youtube.upload',
        retryOn: (e) => /5\d\d|rate limit|quota|timeout/i.test((e as Error).message),
      },
    );

    const id = res.data.id;
    if (!id) throw new Error('YouTube upload returned no id');
    logger.info({ id, size }, 'youtube upload complete');

    if (input.thumbnailPath) {
      await this.setThumbnail(id, input.thumbnailPath);
    }
    return id;
  }

  async setThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
    if (!this.yt) throw new Error('YouTube not configured');
    await withRetry(
      () =>
        this.yt!.thumbnails.set({
          videoId,
          media: { body: createReadStream(thumbnailPath) },
        }),
      { label: 'youtube.thumbnail' },
    );
  }

  async getStatus(videoId: string): Promise<{ status: string; privacyStatus: string }> {
    if (!this.yt) throw new Error('YouTube not configured');
    const res = await this.yt.videos.list({
      part: ['status', 'processingDetails'],
      id: [videoId],
    });
    const v = res.data.items?.[0];
    return {
      status: v?.processingDetails?.processingStatus ?? 'unknown',
      privacyStatus: v?.status?.privacyStatus ?? 'unknown',
    };
  }

  async schedule(videoId: string, publishAt: Date): Promise<void> {
    if (!this.yt) throw new Error('YouTube not configured');
    await this.yt.videos.update({
      part: ['status'],
      requestBody: {
        id: videoId,
        status: { privacyStatus: 'private', publishAt: publishAt.toISOString() },
      },
    });
  }
}