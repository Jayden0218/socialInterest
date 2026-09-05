import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

/**
 * CDN media delivery. D-4 in the divergence register.
 *
 * DIVERGENCE WARNING: locally, media is read straight from MinIO. In production a
 * CDN sits in front of the bucket, and it differs in the ways that matter most -
 * signed-URL scope and expiry, and caching.
 *
 * The caching one is the reason this divergence is dangerous. A CDN that serves a
 * cached object after a post is made private defeats an immediately-effective
 * visibility change (Principle II) while every test above the CDN still passes.
 * See docs/verification/runbooks/d4-media-delivery.md, gated on approval.
 *
 * Created in 002/T075: there was no adapter for this path at all, so the register
 * had an entry with no implementation behind it.
 */
export interface MediaDeliveryConfig {
  domain: string;
  keyPairId: string;
  privateKey: string;
  /** Deliberately short. A signed URL outlives a visibility change otherwise. */
  ttlSeconds?: number;
}

export interface MediaDelivery {
  urlFor(key: string): string;
}

export class CloudFrontMediaDelivery implements MediaDelivery {
  private static readonly DEFAULT_TTL_SECONDS = 300;

  constructor(private readonly config: MediaDeliveryConfig) {}

  urlFor(key: string): string {
    const ttl = this.config.ttlSeconds ?? CloudFrontMediaDelivery.DEFAULT_TTL_SECONDS;
    return getSignedUrl({
      url: `https://${this.config.domain}/${key}`,
      keyPairId: this.config.keyPairId,
      privateKey: this.config.privateKey,
      dateLessThan: new Date(Date.now() + ttl * 1000).toISOString(),
    });
  }
}

/**
 * The local stand-in: the object is read straight from the store, so there is no
 * signature and nothing to expire. Present so the two paths have one interface
 * and the divergence is visible in the type system rather than implied.
 */
export class DirectMediaDelivery implements MediaDelivery {
  constructor(private readonly endpoint: string, private readonly bucket: string) {}

  urlFor(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }
}
