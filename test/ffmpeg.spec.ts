import { FfmpegService } from '../src/modules/ffmpeg/ffmpeg.service';
import { spawnSync } from 'node:child_process';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

(hasFfmpeg ? describe : describe.skip)('FfmpegService', () => {
  it('reports an error for a bad invocation', async () => {
    const svc = new FfmpegService();
    await expect(svc.run(['-i', '/does/not/exist.mp4', '/tmp/out.mp4'], 'test')).rejects.toThrow();
  });
});