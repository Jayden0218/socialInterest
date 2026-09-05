import type { MediaJob, MediaProcessor } from '../../ports';

/**
 * AWS Elemental MediaConvert.
 *
 * DIVERGENCE WARNING (research D9): this is NOT the same implementation as the
 * local ffmpeg adapter. Codec defaults, HLS segmenting behaviour, and failure
 * modes differ. Green ffmpeg tests are not evidence this path works. Before
 * launch this must be exercised against a staging account - see
 * docs/mediaconvert-smoke-test.md (T169).
 *
 * Not wired up: the `aws` profile is a deferred placeholder and nothing in
 * tasks.md provisions it (plan.md Cost Posture). The method bodies are left
 * unimplemented deliberately rather than faked, so that selecting the `aws`
 * profile fails loudly instead of silently doing nothing.
 */
export class MediaConvertMediaProcessor implements MediaProcessor {
  private static readonly NOT_PROVISIONED =
    'MediaConvert adapter is not provisioned. The aws profile is a deferred ' +
    'placeholder; deploying requires explicit approval (plan.md Cost Posture).';

  async submitVideoJob(): Promise<MediaJob> {
    throw new Error(MediaConvertMediaProcessor.NOT_PROVISIONED);
  }

  async getJob(): Promise<MediaJob> {
    throw new Error(MediaConvertMediaProcessor.NOT_PROVISIONED);
  }

  async processImage(): Promise<never> {
    throw new Error(MediaConvertMediaProcessor.NOT_PROVISIONED);
  }
}
