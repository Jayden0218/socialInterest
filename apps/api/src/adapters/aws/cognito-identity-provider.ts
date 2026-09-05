import type { IdentityProvider, VerifiedPrincipal } from '../../ports';

/**
 * Amazon Cognito user pools (research D7).
 *
 * Not provisioned: the `aws` profile is a deferred placeholder (plan.md Cost
 * Posture). Verification would validate the JWT against the pool's JWKS.
 * `issueForTesting` is deliberately absent - tokens come from the pool, never
 * from the API, so there is nothing to mint here.
 */
export class CognitoIdentityProvider implements IdentityProvider {
  async verify(_token: string): Promise<VerifiedPrincipal | null> {
    throw new Error(
      'Cognito adapter is not provisioned. The aws profile is a deferred placeholder; ' +
        'deploying requires explicit approval (plan.md Cost Posture).',
    );
  }
}
