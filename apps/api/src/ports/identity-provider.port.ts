export interface VerifiedPrincipal {
  userId: string;
  /** Operators may create top-level interests (FR-021) and moderate (FR-045). */
  isOperator: boolean;
}

export interface IdentityProvider {
  verify(token: string): Promise<VerifiedPrincipal | null>;

  /**
   * 011/T015. ISSUES A CREDENTIAL FOR A PERSON WHO HAS JUST PROVED WHO THEY ARE.
   *
   * DELIBERATELY SEPARATE FROM `issueForTesting`, which stays exactly what its
   * name says. A test affordance and the product path being one method is how a
   * test affordance ends up in production — and this one mints identities, so
   * the two must stay distinguishable by reading the call site.
   *
   * `epoch` (US4) is carried in the credential and compared on verify. An absent
   * one verifies: accounts created by the device-token tool hold no credential
   * record, so there is nothing to compare, and failing closed there would sign
   * out every emulator journey and the laptop runbook while protecting nothing.
   *
   * NEVER ISSUES AN OPERATOR. There is no parameter for it, which is FR-025
   * enforced by the type rather than by remembering: signing up cannot produce
   * an operator whatever the request body contains, because the method that
   * serves sign-up cannot express one.
   */
  issueForPerson?(userId: string, opts?: { epoch?: number }): Promise<string>;

  /** Local profile only; the AWS adapter rejects this. */
  issueForTesting?(userId: string, opts?: { isOperator?: boolean }): Promise<string>;
}

export const IDENTITY_PROVIDER = Symbol('IdentityProvider');
