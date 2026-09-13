import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/configuration';
import type { MediaJob, MediaProcessor, ObjectStore } from '../../ports';

const run = promisify(execFile);

/**
 * ffmpeg, executed as a BINARY. NOT an emulation of a managed transcoder
 * (research D9) - it is a different implementation of the same port.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 010/T026 — WHY THIS STOPPED SHELLING OUT TO `docker run`
 * ────────────────────────────────────────────────────────────────────────────
 *
 * It ran `docker run --rm -v <tmp>:/w <image> ...`, which needs a container
 * runtime with a socket the API can reach and a tmp directory the DAEMON can
 * bind-mount. Neither holds anywhere this is going:
 *
 *   - no managed host gives a container a Docker socket, and mounting a host
 *     path from inside a container mounts the HOST's path, not the container's
 *   - a laptop would need Docker Desktop running purely to resize an image
 *
 * THERE IS EXACTLY ONE IMPLEMENTATION, and that is deliberate. The obvious
 * alternative - keep both and choose with an env var - is precisely the shape
 * the four AWS adapters were deleted for: "four untested implementations
 * selected by an env var is how a defect hides". So the code knows one thing,
 * running `ffmpeg`, and an environment without a native binary supplies one
 * (`scripts/ffmpeg-shim/`, which is a two-line script that calls docker). The
 * variation lives outside the code, where it can be seen, rather than inside it
 * behind a flag nobody exercises.
 */
export class FfmpegMediaProcessor implements MediaProcessor {
  private readonly jobs = new Map<string, MediaJob>();

  constructor(
    private readonly config: AppConfig,
    private readonly store: ObjectStore,
  ) {}

  /**
   * `cwd` rather than a bind mount: the working directory IS the temp directory,
   * so every path in `args` stays relative and nothing has to be translated
   * between a host path and a container path.
   */
  private async ffmpeg(dir: string, args: string[]): Promise<void> {
    await run(this.config.media.ffmpegPath, args, { cwd: dir });
  }

  async submitVideoJob(input: { sourceKey: string; outputPrefix: string }): Promise<MediaJob> {
    const jobId = randomUUID();
    const job: MediaJob = { jobId, state: 'running' };
    this.jobs.set(jobId, job);
    // Run out of band so the caller is not blocked, mirroring MediaConvert's
    // submit-then-poll shape rather than transcoding inline.
    void this.transcode(jobId, input).catch((e: unknown) => {
      // Logged, not only recorded. A failed transcode leaves a post visible to
      // nobody but its author, and the only trace used to be a field on an
      // in-memory job nothing printed - so the symptom was "my video never
      // appears" with no diagnosis anywhere.
      console.error(`[media] transcode ${jobId} failed: ${String(e).slice(0, 500)}`);
      this.jobs.set(jobId, { jobId, state: 'failed', error: String(e).slice(0, 300) });
    });
    return job;
  }

  private async transcode(
    jobId: string,
    input: { sourceKey: string; outputPrefix: string },
  ): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'sih-video-'));
    try {
      await writeFile(join(dir, 'in.mp4'), await this.store.getObject(input.sourceKey));
      /**
       * FR-009: a poster frame shown before playback begins.
       *
       * The `thumbnail` filter, NOT a seek to one second.
       *
       * `-ss 00:00:01` seeks past the end of any clip shorter than a second.
       * ffmpeg then writes nothing ("Nothing was written into output file"),
       * exits non-zero, and the whole transcode fails - leaving the post at
       * `processingState: failed` permanently. A post that never reaches `ready`
       * is visible only to its author, which is the exact state feature 002
       * found the entire product stuck in.
       *
       * Nothing caught it because nothing had ever uploaded a video. The journey
       * created an upload target and asserted a state string; `mp4Short()` sat
       * in the test support unused. FR-005 and FR-009 were reported complete
       * twice on that basis.
       *
       * `thumbnail` picks a representative frame from the stream itself, so it
       * works for any duration and does not need the length known up front.
       */
      await this.ffmpeg(dir, ['-i', 'in.mp4', '-vf', 'thumbnail', '-frames:v', '1', '-y', 'poster.jpg']);
      await this.ffmpeg(dir, [
        '-i', 'in.mp4', '-c:v', 'libx264', '-preset', 'veryfast',
        '-hls_time', '4', '-hls_playlist_type', 'vod', '-y', 'index.m3u8',
      ]);

      const renditions: Record<string, string> = {};
      for (const file of await readdir(dir)) {
        if (file === 'in.mp4') continue;
        const key = `${input.outputPrefix}/${file}`;
        const type = file.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : file.endsWith('.ts')
            ? 'video/mp2t'
            : 'image/jpeg';
        await this.store.putObject(key, await readFile(join(dir, file)), type);
        if (file === 'index.m3u8') renditions['hls'] = key;
      }
      this.jobs.set(jobId, {
        jobId,
        state: 'complete',
        renditions,
        posterKey: `${input.outputPrefix}/poster.jpg`,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async getJob(jobId: string): Promise<MediaJob> {
    return this.jobs.get(jobId) ?? { jobId, state: 'failed', error: 'unknown job' };
  }

  /**
   * FR-010: location metadata is stripped HERE, server-side, where a modified
   * client cannot skip it. `-map_metadata -1` drops all container metadata.
   */
  async processImage(input: {
    source: Buffer;
    contentType: string;
    keepLocationMetadata: boolean;
  }): Promise<{ body: Buffer; width: number; height: number; exifStripped: boolean }> {
    const dir = await mkdtemp(join(tmpdir(), 'sih-image-'));
    try {
      await writeFile(join(dir, 'in.bin'), input.source);
      const args = ['-i', 'in.bin'];
      if (!input.keepLocationMetadata) args.push('-map_metadata', '-1');
      args.push('-y', 'out.jpg');
      await this.ffmpeg(dir, args);

      const { stdout } = await run(
        this.config.media.ffprobePath,
        [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height', '-of', 'csv=p=0', 'out.jpg',
        ],
        { cwd: dir },
      );
      const [w, h] = stdout.trim().split(',').map(Number);

      return {
        body: await readFile(join(dir, 'out.jpg')),
        width: w ?? 0,
        height: h ?? 0,
        exifStripped: !input.keepLocationMetadata,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
