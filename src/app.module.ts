import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { FfmpegService } from './modules/ffmpeg/ffmpeg.service';
import { GcsService } from './modules/storage/gcs.service';
import { YoutubeService } from './modules/youtube/youtube.service';
import { NotificationService } from './modules/notifications/notification.service';
import { JobsService } from './modules/jobs/jobs.service';
import { SchedulerService } from './modules/scheduler/scheduler.service';

import { TopicStage } from './modules/pipeline/stages/topic.stage';
import { ResearchStage } from './modules/pipeline/stages/research.stage';
import { ScriptStage } from './modules/pipeline/stages/script.stage';
import { FactCheckStage } from './modules/pipeline/stages/fact-check.stage';
import { ScenePlanStage } from './modules/pipeline/stages/scene-plan.stage';
import { AssetStage } from './modules/pipeline/stages/asset.stage';
import { VoiceStage } from './modules/pipeline/stages/voice.stage';
import { ThumbnailStage } from './modules/pipeline/stages/thumbnail.stage';
import { MetadataStage } from './modules/pipeline/stages/metadata.stage';
import { QaStage } from './modules/pipeline/stages/qa.stage';
import { PipelineService } from './modules/pipeline/pipeline.service';

@Module({
  imports: [ConfigModule, DatabaseModule, AiModule, ScheduleModule.forRoot()],
  providers: [
    FfmpegService,
    GcsService,
    YoutubeService,
    NotificationService,
    JobsService,
    SchedulerService,
    TopicStage,
    ResearchStage,
    ScriptStage,
    FactCheckStage,
    ScenePlanStage,
    AssetStage,
    VoiceStage,
    ThumbnailStage,
    MetadataStage,
    QaStage,
    PipelineService,
  ],
  exports: [PipelineService, JobsService],
})
export class AppModule {}