import jwt from 'jsonwebtoken';
import type { AppConfig } from '../../config/configuration';
import type { IdentityProvider, VerifiedPrincipal } from '../../ports';

/**
 * Local JWT issuer. Stands in for Cognito so the whole suite runs with no AWS
 * account (research D9). Signing key comes from config and is dev-only.
 */
export class LocalIdentityProvider implements IdentityProvider {
  constructor(private readonly config: AppConfig) {}

  /**
   * NO EPOCH COMPARISON HERE, and `identity-provider.port.ts` used to say there
   * was. See the corrected note on `issueForPerson` there: the claim is signed
   * into every credential and read by nothing, dormant only because US4 —
   * the one thing that would ever advance an epoch — is not built.
   */
  async verify(token: string): Promise<VerifiedPrincipal | null> {
    try {
      const claims = jwt.verify(token, this.config.identity.jwtSecret, {
        issuer: this.config.identity.issuer,
      }) as { sub?: string; operator?: boolean };
      if (!claims.sub) return null;
      return { userId: claims.sub, isOperator: claims.operator === true };
    } catch {
      return null;
    }
  }

  /**
   * 011/T015. A CREDENTIAL FOR SOMEBODY WHO HAS JUST PROVED WHO THEY ARE.
   *
   * `operator: false`, unconditionally and with no parameter to say otherwise —
   * FR-025 enforced by the shape of the method rather than by a check somebody
   * has to remember. Signing up cannot produce an operator whatever the request
   * body contains, because this cannot express one.
   *
   * THIRTY DAYS, and the trade is stated rather than hidden. The spec accepts one
   * long-lived credential over access-plus-refresh (Assumptions): the device
   * already persists a credential across relaunches and already treats a
   * rejected one as "sign in again", so refresh tokens would be a second
   * mechanism serving a requirement nobody has stated. The cost is that a stolen
   * credential is useful for its whole life — which is exactly what FR-021's
   * epoch is for, so a reset ends the ones outstanding.
   *
   * Two hours, `issueForTesting`'s figure, is right for a 25-minute CI job and
   * wrong for a person, for whom it means being signed out over lunch with a
   * symptom — "the app stopped working" — indistinguishable from the backend
   * being down.
   */
  async issueForPerson(userId: string, opts?: { epoch?: number }): Promise<string> {
    return jwt.sign(
      {
        sub: userId,
        operator: false,
        // Omitted rather than sent as undefined when there is none: `jwt.sign`
        // would drop it anyway, and an explicit `epoch: undefined` reads as a
        // value somebody meant to fill in.
        ...(opts?.epoch === undefined ? {} : { epoch: opts.epoch }),
      },
      this.config.identity.jwtSecret,
      { issuer: this.config.identity.issuer, expiresIn: '30d' },
    );
  }

  async issueForTesting(userId: string, opts?: { isOperator?: boolean }): Promise<string> {
    return jwt.sign(
      { sub: userId, operator: opts?.isOperator === true },
      this.config.identity.jwtSecret,
      { issuer: this.config.identity.issuer, expiresIn: '1h' },
    );
  }
}
