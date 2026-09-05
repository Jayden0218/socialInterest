import jwt from 'jsonwebtoken';
import type { AppConfig } from '../../config/configuration';
import type { IdentityProvider, VerifiedPrincipal } from '../../ports';

/**
 * Local JWT issuer. Stands in for Cognito so the whole suite runs with no AWS
 * account (research D9). Signing key comes from config and is dev-only.
 */
export class LocalIdentityProvider implements IdentityProvider {
  constructor(private readonly config: AppConfig) {}

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

  async issueForTesting(userId: string, opts?: { isOperator?: boolean }): Promise<string> {
    return jwt.sign(
      { sub: userId, operator: opts?.isOperator === true },
      this.config.identity.jwtSecret,
      { issuer: this.config.identity.issuer, expiresIn: '1h' },
    );
  }
}
