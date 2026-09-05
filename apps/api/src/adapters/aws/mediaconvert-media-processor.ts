import {
  MediaConvertClient,
  CreateJobCommand,
  GetJobCommand,
} from '@aws-sdk/client-mediaconvert';
import type { MediaJob, MediaProcessor } from '../../ports';

/**
 * AWS Elemental MediaConvert. D-2 in the divergence register.
 *
 * DIVERGENCE WARNING (research 001/D9): NOT the same implementation as the local
 * ffmpeg adapter. Codec defaults, HLS segmenting, queueing and failure modes all
 * differ, and green ffmpeg tests are not evidence this path works. It has never
 * been executed - see docs/verification/runbooks/d2-transcode.md, which is gated
 * on approval to provision a queue.
 *
 * Written in 002/T073 because the previous version threw NOT_PROVISIONED from
 * every method: the register could say "unverified" but there was nothing to run.
 */
export interface MediaConvertConfig {
  region: string;
  endpoint?: string;
  role: string;
  queue?: string;
  bucket: string;
}

export class MediaConvertMediaProcessor implements MediaProcessor {
  private readonly client: MediaConvertClient;

  constructor(private readonly config: MediaConvertConfig) {
    this.client = new MediaConvertClient({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  async submitVideoJob(input: { sourceKey: string; outputPrefix: string }): Promise<MediaJob> {
    const res = await this.client.send(
      new CreateJobCommand({
        Role: this.config.role,
        ...(this.config.queue ? { Queue: this.config.queue } : {}),
        Settings: {
          Inputs: [{ FileInput: `s3://${this.config.bucket}/${input.sourceKey}` }],
          OutputGroups: [
            {
              Name: 'Apple HLS',
              OutputGroupSettings: {
                Type: 'HLS_GROUP_SETTINGS',
                HlsGroupSettings: {
                  Destination: `s3://${this.config.bucket}/${input.outputPrefix}`,
                  SegmentLength: 6,
                  MinSegmentLength: 0,
                },
              },
              Outputs: [
                {
                  ContainerSettings: { Container: 'M3U8' },
                  VideoDescription: {
                    CodecSettings: { Codec: 'H_264', H264Settings: { RateControlMode: 'QVBR' } },
                  },
                  AudioDescriptions: [
                    { CodecSettings: { Codec: 'AAC', AacSettings: { Bitrate: 96000, CodingMode: 'CODING_MODE_2_0', SampleRate: 48000 } } },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
    return { jobId: res.Job?.Id ?? '', state: mapState(res.Job?.Status) };
  }

  async getJob(jobId: string): Promise<MediaJob> {
    const res = await this.client.send(new GetJobCommand({ Id: jobId }));
    const job = res.Job;
    const state = mapState(job?.Status);
    return {
      jobId,
      state,
      ...(state === 'failed' && job?.ErrorMessage ? { error: job.ErrorMessage } : {}),
    };
  }

  /**
   * MediaConvert is a video service and does not process stills, so the image
   * path - which is where FR-010's location strip is enforced - is NOT delegated
   * to it.
   *
   * Throwing here is deliberate and is not the placeholder this file used to be:
   * an image reaching this adapter means the wiring is wrong, and silently
   * returning unstripped bytes would break a privacy guarantee. The aws profile
   * pairs this with an image processor; see d2-transcode.md, whose proof includes
   * the strip explicitly for that reason.
   */
  async processImage(): Promise<never> {
    throw new Error(
      'MediaConvert does not process images. The image path enforces FR-010 and must ' +
        'be routed to the image processor, not here.',
    );
  }
}

function mapState(status: string | undefined): MediaJob['state'] {
  switch (status) {
    case 'COMPLETE':
      return 'complete';
    case 'ERROR':
    case 'CANCELED':
      return 'failed';
    case 'PROGRESSING':
      return 'running';
    default:
      return 'queued';
  }
}
