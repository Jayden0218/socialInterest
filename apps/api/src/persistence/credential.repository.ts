import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import type { TransactionItems } from './transactor';
import { keys } from './keys';

export interface CredentialItem {
  /** The person this credential is for. */
  userId: string;
  /** Trimmed and lower-cased. The key is derived from it; see `fold`. */
  emailFolded: string;
  /** `scrypt$N$r$p$salt$hash` — self-describing, so the choice stays reversible. */
  password: string;
  /**
   * 011/US4. Advanced by a password reset; credentials issued before it stop
   * verifying. An ABSENT epoch verifies — see `local-identity-provider.ts`.
   */
  epoch?: number;
  createdAt: string;
}

/**
 * 011/T012. THE ROW THAT ANSWERS "WHO IS jo@example.com, AND IS THIS THEIR
 * PASSWORD".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PARTITIONED BY THE EMAIL, NOT BY THE USER
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The question is asked before any user id is known, so a row keyed by user
 * would need an index to be found at all. More importantly it would have nowhere
 * to put the uniqueness guarantee: keyed by the address, **the key itself is the
 * constraint**, claimed with the conditional write that already makes `putItem`
 * atomic. FR-002 and SC-005 are served by the shape of the row rather than by
 * anything the service remembers to do.
 *
 * A lookup followed by a write would pass every sequential test of that and fail
 * under exactly the two simultaneous requests it exists for — measured, for the
 * handle case, in `docs/verification/011-guard-red-log.md`: eight of eight.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NOTHING OUTSIDE `auth` MAY READ ONE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * There is no route that returns a credential row and no projection that
 * includes one. The email address is deliberately NOT on `PublicProfile`:
 * `profile.projection.ts` is the one place a public profile is built, and a
 * field added there is published on all seven projections at once (008/US5's
 * defect, and 006/R4b's before it).
 */
@Injectable()
export class CredentialRepository extends BaseRepository {
  /**
   * FR-004, and it lives HERE so there is one place the rule is applied.
   *
   * `Jo@Example.com ` and `jo@example.com` are one address for uniqueness and
   * for sign-in. Two callers folding differently would produce two rows for one
   * address with nothing complaining — the constraint is the key, so a
   * difference in how the key is built IS a difference in what is unique.
   */
  static fold(email: string): string {
    return email.trim().toLowerCase();
  }

  async findByEmail(email: string): Promise<CredentialItem | null> {
    return this.getItem<CredentialItem>(
      keys.credentialByEmail(CredentialRepository.fold(email)),
    );
  }

  async findForUser(userId: string, email: string): Promise<CredentialItem | null> {
    const found = await this.findByEmail(email);
    return found && found.userId === userId ? found : null;
  }

  /**
   * The write, as a transaction item for the caller to include.
   *
   * Exposed rather than written here for the same reason the handle claim is:
   * sign-up writes the person, the handle claim and this together or writes
   * none of them. A credential written separately has an outcome where somebody
   * can sign in as a person who does not exist, and a person written separately
   * has an outcome where somebody holds a handle they can never sign in to.
   */
  createItem(item: CredentialItem): TransactionItems[number] {
    return {
      Put: {
        TableName: this.tableName,
        Item: {
          ...keys.credentialByEmail(item.emailFolded),
          type: 'Credential',
          ...item,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }
}
