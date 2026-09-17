import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { logger } from '../../common/logger';

export interface AssembleInput {
  workDir: string;
  scenes: Array<{
    index: number;
    duration: number;
    assetPath: string;   // .mp4 or .jpg/.png
    kind: 'video' | 'image';
  }>;
  narrationWav: string;
  musicPath?: string;
  outputPath: string;
  subtitlesSrt?: string;
  resolution?: { w: number; h: number };
}

@Injectable()
export class FfmpegService {
  async run(args: string[], label: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) return resolve();
        logger.error({ label, code, stderr: stderr.slice(-4000) }, 'ffmpeg failed');
        reject(new Error(`ffmpeg ${label} failed with code ${code}`));
      });
    });
  }

  async assemble(input: AssembleInput): Promise<void> {
    const { workDir, scenes, narrationWav, musicPath, outputPath, subtitlesSrt } = input;
    const { w, h } = input.resolution ?? { w: 1920, h: 1080 };

    await mkdir(workDir, { recursive: true });
    await mkdir(dirname(outputPath), { recursive: true });

    // 1. Normalize each scene into a fixed-format mp4 clip with subtle motion for stills.
    const clipPaths: string[] = [];
    for (const scene of scenes) {
      const out = join(workDir, `clip-${scene.index.toString().padStart(3, '0')}.mp4`);
      if (scene.kind === 'video') {
        await this.run(
          [
            '-y',
            '-i', scene.assetPath,
            '-t', String(scene.duration),
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
            '-r', '30',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-an',
            out,
          ],
          `clip-${scene.index}`,
        );
      } else {
        // Ken Burns zoom on stills
        const frames = scene.duration * 30;
        await this.run(
          [
            '-y',
            '-loop', '1',
            '-i', scene.assetPath,
            '-t', String(scene.duration),
            '-vf',
            `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
              `zoompan=z='min(zoom+0.0008,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h},` +
              `setsar=1`,
            '-r', '30',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-an',
            out,
          ],
          `still-${scene.index}`,
        );
      }
      clipPaths.push(out);
    }

    // 2. Concatenate
    const concatList = join(workDir, 'concat.txt');
    await writeFile(concatList, clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    const videoTrack = join(workDir, 'video-track.mp4');
    await this.run(
      ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', videoTrack],
      'concat',
    );

    // 3. Mix narration + optional music
    const mixedAudio = join(workDir, 'mixed.m4a');
    if (musicPath) {
      await this.run(
        [
          '-y',
          '-i', narrationWav,
          '-stream_loop', '-1',
          '-i', musicPath,
          '-filter_complex',
          '[0:a]aformat=sample_rates=48000:channel_layouts=stereo[nar];' +
            '[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.18[mus];' +
            '[mus][nar]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[ducked];' +
            '[nar][ducked]amix=inputs=2:duration=first:dropout_transition=0[out]',
          '-map', '[out]',
          '-c:a', 'aac', '-b:a', '192k',
          '-shortest',
          mixedAudio,
        ],
        'audio-mix',
      );
    } else {
      await this.run(
        ['-y', '-i', narrationWav, '-c:a', 'aac', '-b:a', '192k', mixedAudio],
        'audio-only',
      );
    }

    // 4. Merge video + audio, optionally burn subtitles
    const vf: string[] = [];
    if (subtitlesSrt) {
      vf.push(`subtitles='${subtitlesSrt.replace(/'/g, "'\\''")}':force_style='FontSize=20,OutlineColour=&H80000000,BorderStyle=3'`);
    }

    const mergeArgs = [
      '-y',
      '-i', videoTrack,
      '-i', mixedAudio,
      ...(vf.length ? ['-vf', vf.join(',')] : []),
      '-c:v', vf.length ? 'libx264' : 'copy',
      ...(vf.length ? ['-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p'] : []),
      '-c:a', 'copy',
      '-shortest',
      outputPath,
    ];

    await this.run(mergeArgs, 'final-merge');
  }
}