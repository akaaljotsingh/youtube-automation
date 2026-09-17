import { Injectable } from '@nestjs/common';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../../database/prisma.service';
import { TopicStage } from './stages/topic.stage';
import { ResearchStage } from './stages/research.stage';
import { ScriptStage } from './stages/script.stage';
import { FactCheckStage } from './stages/fact-check.stage';
import { ScenePlanStage, type ScenePlan } from './stages/scene-plan.stage';
import { AssetStage } from './stages/asset.stage';
import { VoiceStage } from './stages/voice.stage';
import { ThumbnailStage } from './stages/thumbnail.stage';
import { MetadataStage } from './stages/metadata.stage';
import { QaStage } from './stages/qa.stage';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { GcsService } from '../storage/gcs.service';
import { YoutubeService } from '../youtube/youtube.service';
import { logger } from '../../common/logger';
import { withRetry } from '../../common/retry';
import { VideoStatus } from '@prisma/client';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly topic: TopicStage,
    private readonly research: ResearchStage,
    private readonly script: ScriptStage,
    private readonly factCheck: FactCheckStage,
    private readonly scenePlan: ScenePlanStage,
    private readonly assets: AssetStage,
    private readonly voice: VoiceStage,
    private readonly thumbnail: ThumbnailStage,
    private readonly metadata: MetadataStage,
    private readonly qa: QaStage,
    private readonly ffmpeg: FfmpegService,
    private readonly gcs: GcsService,
    private readonly youtube: YoutubeService,
    private readonly notify: NotificationService,
  ) {}

  async runFullPipeline(channelKey: string, dryRun = process.env.DRY_RUN === 'true'): Promise<string> {
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { key: channelKey } });
    const style = (channel.config as { style?: Record<string, unknown> })?.style ?? {};

    // 1. Topic
    const candidate = await withRetry(() => this.topic.run(channelKey), { label: 'pipeline.topic' });
    const video = await this.prisma.video.create({
      data: {
        channelId: channel.id,
        topic: candidate.topic,
        title: candidate.workingTitle,
        status: VideoStatus.RESEARCHING,
      },
    });
    logger.info({ videoId: video.id, topic: candidate.topic }, 'pipeline started');

    const workDir = join(tmpdir(), `ytaf-${video.id}`);
    await mkdir(workDir, { recursive: true });

    try {
      // 2. Research
      const research = await withRetry(() => this.research.run(candidate.topic), { label: 'pipeline.research' });
      await this.prisma.video.update({
        where: { id: video.id },
        data: { research: research as object, status: VideoStatus.RESEARCH_READY },
      });

      // 3. Script
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.SCRIPTING } });
      const script = await withRetry(() => this.script.run(research, style), { label: 'pipeline.script' });
      await this.prisma.video.update({
        where: { id: video.id },
        data: { script: script as object, status: VideoStatus.SCRIPT_READY },
      });

      // 4. Fact-check
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.FACT_CHECKING } });
      const factCheck = await withRetry(() => this.factCheck.run(research, script), { label: 'pipeline.factcheck' });
      await this.prisma.video.update({
        where: { id: video.id },
        data: { factCheck: factCheck as object, status: VideoStatus.FACT_CHECKING },
      });

      if (factCheck.unsupportedCount > 0) {
        logger.warn({ videoId: video.id, unsupported: factCheck.unsupportedCount }, 'unsupported claims — continuing');
      }

      // 5. Scene planning
      const scenes = await withRetry(
        () => this.scenePlan.run(script, script.estimatedDurationSeconds || 540),
        { label: 'pipeline.scenes' },
      );
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.SCENES_READY } });

      for (const s of scenes) {
        await this.prisma.scene.create({
          data: {
            videoId: video.id,
            index: s.index,
            duration: s.duration,
            narration: s.narration,
            visualKind: s.visualKind,
            prompt: s.prompt,
            camera: s.camera,
            style: s.style,
          },
        });
      }

      // 6. Generate assets
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.GENERATING_ASSETS } });
      const assetPaths = await this.generateAllAssets(video.id, scenes, workDir);

      // 7. Voice
      const voicePath = join(workDir, 'narration.wav');
      await withRetry(() => this.voice.run(script, voicePath), { label: 'pipeline.voice' });
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.VOICE_READY } });

      // 8. Assembly
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.ASSEMBLING } });
      const finalPath = join(workDir, 'final.mp4');
      await this.ffmpeg.assemble({
        workDir,
        scenes: scenes.map((s) => ({
          index: s.index,
          duration: s.duration,
          assetPath: assetPaths.get(s.index)!,
          kind: s.visualKind === 'veo' ? 'video' : 'image',
        })),
        narrationWav: voicePath,
        outputPath: finalPath,
      });

      // 9. Thumbnail
      const thumbPath = join(workDir, 'thumb.png');
      await withRetry(() => this.thumbnail.run(script.title, candidate.topic, thumbPath), { label: 'pipeline.thumb' });

      // 10. Metadata
      const meta = await withRetry(() => this.metadata.run(script, candidate.topic), { label: 'pipeline.meta' });

      // 11. QA
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.QA } });
      const tq = await this.qa.technicalCheck(finalPath, thumbPath);
      const cq = await this.qa.contentCheck(script, factCheck);
      if (!tq.ok || !cq.ok) {
        const reasons = [...tq.reasons, ...cq.reasons];
        await this.prisma.video.update({
          where: { id: video.id },
          data: { status: VideoStatus.BLOCKED, error: reasons.join('; ') },
        });
        await this.notify.alert(`🚨 Video ${video.id} blocked\n${reasons.join('\n')}`);
        return video.id;
      }

      await this.prisma.video.update({
        where: { id: video.id },
        data: {
          status: VideoStatus.READY,
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          videoPath: finalPath,
          thumbnailPath: thumbPath,
        },
      });

      // 12. Upload to GCS
      // const remoteBase = `videos/${new Date().toISOString().slice(0, 10)}/${video.id}`;
      // const remoteVideo = await this.gcs.upload(finalPath, `${remoteBase}/final.mp4`, 'video/mp4');
      // const remoteThumb = await this.gcs.upload(thumbPath, `${remoteBase}/thumb.png`, 'image/png');

      // 12. Upload to GCS (optional)
      let remoteVideo = '';
      let remoteThumb = '';
      if (this.gcs.isEnabled()) {
        const remoteBase = `videos/${new Date().toISOString().slice(0, 10)}/${video.id}`;
        remoteVideo = await this.gcs.upload(finalPath, `${remoteBase}/final.mp4`, 'video/mp4');
        remoteThumb = await this.gcs.upload(thumbPath, `${remoteBase}/thumb.png`, 'image/png');
      } else {
        logger.info({ videoId: video.id }, 'GCS not configured — keeping files locally');
      }

      // Skip YouTube if DRY_RUN or if credentials are missing
      if (dryRun || !this.youtube.isEnabled()) {
        logger.info(
          { videoId: video.id, remoteVideo, remoteThumb, dryRun, ytEnabled: this.youtube.isEnabled() },
          'skipping YouTube upload',
        );
        await this.prisma.video.update({
          where: { id: video.id },
          data: {
            status: VideoStatus.READY,
            error: this.youtube.isEnabled() ? null : 'YouTube credentials not configured',
          },
        });
        return video.id;
      }

      // 13. Upload to YouTube (private)
      await this.prisma.video.update({ where: { id: video.id }, data: { status: VideoStatus.UPLOADING } });
      const scheduledAt = this.computeSchedule(channel.publishHour, channel.timezone);

      const ytId = await this.youtube.upload({
        videoPath: finalPath,
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        categoryId: meta.categoryId,
        privacyStatus: process.env.AUTO_PUBLISH === 'true' ? 'private' : 'private',
        publishAt: process.env.AUTO_PUBLISH === 'true' ? scheduledAt : undefined,
        thumbnailPath: thumbPath,
      });

      await this.prisma.video.update({
        where: { id: video.id },
        data: {
          youtubeVideoId: ytId,
          scheduledAt,
          status: VideoStatus.SCHEDULED,
        },
      });

      await this.notify.alert(
        `✅ Video ready\n${meta.title}\nScheduled: ${scheduledAt.toISOString()}\nhttps://youtu.be/${ytId}`,
      );

      logger.info({ videoId: video.id, ytId }, 'pipeline completed');
      return video.id;

    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ videoId: video.id, err: msg }, 'pipeline failed');
      await this.prisma.video.update({
        where: { id: video.id },
        data: { status: VideoStatus.FAILED, error: msg },
      });
      await this.notify.alert(`❌ Pipeline failed for ${video.id}\n${msg}`);
      throw err;
    }
  }

  private async generateAllAssets(
    videoId: string,
    scenes: ScenePlan[],
    workDir: string,
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const assetsDir = join(workDir, 'assets');
    await mkdir(assetsDir, { recursive: true });

    // Concurrency limit — Veo is expensive & rate-limited
    const concurrency = 2;
    const queue = [...scenes];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const scene = queue.shift()!;
        const dbScene = await this.prisma.scene.findUniqueOrThrow({
          where: { videoId_index: { videoId, index: scene.index } },
        });
        if (dbScene.status === 'COMPLETE' && dbScene.assetPath) {
          map.set(scene.index, dbScene.assetPath);
          continue;
        }
        try {
          const path = await withRetry(() => this.assets.run(scene, assetsDir), {
            label: `asset.${scene.index}`,
            attempts: 3,
            baseDelayMs: 3_000,
          });
          await this.prisma.scene.update({
            where: { id: dbScene.id },
            data: { status: 'COMPLETE', assetPath: path, attempts: dbScene.attempts + 1 },
          });
          map.set(scene.index, path);
        } catch (err) {
          await this.prisma.scene.update({
            where: { id: dbScene.id },
            data: { status: 'FAILED', error: (err as Error).message, attempts: dbScene.attempts + 1 },
          });
          throw err;
        }
      }
    });

    await Promise.all(workers);
    return map;
  }

  private computeSchedule(hour: number, timezone: string): Date {
    // Schedule for the next day at the given hour in the given timezone
    const now = new Date();
    const target = new Date(now);
    target.setUTCDate(target.getUTCDate() + 1);
    // Approximate offset — production would use a TZ library
    const offsetHours = timezone === 'America/New_York' ? -5 : 0;
    target.setUTCHours(hour - offsetHours, 0, 0, 0);
    return target;
  }
}