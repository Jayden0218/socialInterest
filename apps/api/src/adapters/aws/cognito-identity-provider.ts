import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { IdentityProvider, VerifiedPrincipal } from '../../ports';

/**
 * Cognito. D-3 in the divergence register.
 *
 * DIVERGENCE WARNING (research 001/D9): this is NOT the same implementation as
 * the local JWT issuer. Token shape, claims, expiry and refresh all differ, and
 * a green local suite is not evidence this path works. It has never been executed
 * against a real user pool - see docs/verification/runbooks/d3-identity.md, which
 * is gated on the project owner's approval to provision one.
 *
 * Written in 002/T073-T075 because the previous version threw NOT_PROVISIONED
 * from every method, which meant the register could only ever say "unverified"
 * with nothing to run.
 */
export class CognitoIdentityProvider implements IdentityProvider {
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;

  constructor(config: { userPoolId: string; clientId: string }) {
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: 'access',
      clientId: config.clientId,
    });
  }

  async verify(token: string): Promise<VerifiedPrincipal | null> {
    try {
      const claims = await this.verifier.verify(token);
      const sub = typeof claims.sub === 'string' ? claims.sub : null;
      if (!sub) return null;

      /**
       * The operator claim the moderation queue depends on. Cognito expresses
       * group membership as `cognito:groups`; the local issuer uses a boolean.
       * Losing this silently would turn an operator into an ordinary viewer and
       * the queue would simply appear empty - which is why the runbook checks it
       * explicitly rather than trusting the mapping.
       */
      const groups = claims['cognito:groups'];
      const isOperator = Array.isArray(groups) && groups.includes('operators');

      return { userId: sub, isOperator };
    } catch {
      // Expired, wrong issuer, wrong key, malformed: all are "not a caller".
      return null;
    }
  }
}
