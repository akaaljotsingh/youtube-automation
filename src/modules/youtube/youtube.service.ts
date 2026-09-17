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
  private readonly yt: youtube_v3.Youtube;

  constructor(private readonly cfg: ConfigService) {
    const auth = new google.auth.OAuth2(
      cfg.getOrThrow<string>('YOUTUBE_CLIENT_ID'),
      cfg.getOrThrow<string>('YOUTUBE_CLIENT_SECRET'),
    );
    auth.setCredentials({ refresh_token: cfg.getOrThrow<string>('YOUTUBE_REFRESH_TOKEN') });
    this.yt = google.youtube({ version: 'v3', auth });
  }

  async upload(input: UploadInput): Promise<string> {
    const size = statSync(input.videoPath).size;

    const res = await withRetry(
      () =>
        this.yt.videos.insert({
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
    await withRetry(
      () =>
        this.yt.thumbnails.set({
          videoId,
          media: { body: createReadStream(thumbnailPath) },
        }),
      { label: 'youtube.thumbnail' },
    );
  }

  async getStatus(videoId: string): Promise<{ status: string; privacyStatus: string }> {
    const res = await this.yt.videos.list({ part: ['status', 'processingDetails'], id: [videoId] });
    const v = res.data.items?.[0];
    return {
      status: v?.processingDetails?.processingStatus ?? 'unknown',
      privacyStatus: v?.status?.privacyStatus ?? 'unknown',
    };
  }

  async schedule(videoId: string, publishAt: Date): Promise<void> {
    await this.yt.videos.update({
      part: ['status'],
      requestBody: {
        id: videoId,
        status: { privacyStatus: 'private', publishAt: publishAt.toISOString() },
      },
    });
  }
}