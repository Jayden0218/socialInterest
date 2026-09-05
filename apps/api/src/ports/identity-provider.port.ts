export interface VerifiedPrincipal {
  userId: string;
  /** Operators may create top-level interests (FR-021) and moderate (FR-045). */
  isOperator: boolean;
}

export interface IdentityProvider {
  verify(token: string): Promise<VerifiedPrincipal | null>;
  /** Local profile only; the AWS adapter rejects this. */
  issueForTesting?(userId: string, opts?: { isOperator?: boolean }): Promise<string>;
}

export const IDENTITY_PROVIDER = Symbol('IdentityProvider');
