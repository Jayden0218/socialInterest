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
   * `epoch` (US4) is CARRIED in the credential. **It is NOT compared on verify,
   * and this comment said it was** — corrected 2026-09-16 rather than left
   * describing behaviour that does not exist, which is the shape this project
   * records as a declared half with no other half.
   *
   * `verify()` reads `sub` and `operator` and nothing else, so the claim is
   * written and never read. It is DORMANT rather than broken today: nothing
   * advances an epoch, because the only thing that would is US4's password
   * reset (011/T042, T048), and US4 is not built — it needs a mail provider
   * nobody has an account with. A reset that could not end the credentials
   * outstanding would be the defect; a claim nobody has had reason to check is
   * not one yet.
   *
   * **It becomes one the moment a reset exists**, which is why T042 is the task
   * that adds the comparison and T048 is the one that proves a credential
   * obtained before a reset stops working. Whoever does it should also read
   * T044: comparison means a datastore read on the hottest path in the product.
   *
   * The rule T042 must implement, already settled and already load-bearing: an
   * ABSENT epoch verifies, on either side. Accounts created by the device-token
   * tool hold no credential record, so there is nothing to compare, and failing
   * closed there would sign out every emulator journey and the laptop runbook
   * while protecting nothing.
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
