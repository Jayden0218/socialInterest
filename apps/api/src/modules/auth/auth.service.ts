import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import { CredentialRepository, type CredentialItem } from '../../persistence/credential.repository';
import { HandleClaimRepository } from '../../persistence/handle-claim.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../../ports';
import { PASSWORD_MIN_LENGTH, PASSWORD_FLOOR_MESSAGE } from './constants';
import { derivePassword, verifyPassword, DUMMY_STORED } from './password';

export interface SignUpInput {
  email: string;
  password: string;
  handle: string;
  displayName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface Credentialed {
  token: string;
  userId: string;
  handle: string;
}

/**
 * A HANDLE IS NOT A FREE-TEXT FIELD.
 *
 * Lower case, digits, underscore; 3–30. Enforced because the handle is a key —
 * it is the partition of the claim row and the index entry `findByHandle`
 * resolves — so a handle containing `#` would collide with the key scheme's own
 * separator, and one containing whitespace could not be typed back by anybody
 * trying to find the person.
 */
const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

/**
 * Deliberately permissive. An address is validated by whether mail reaches it,
 * which this cannot know, and an over-strict pattern refuses real addresses —
 * `+` tags, long TLDs, unicode domains. This checks the shape a typo breaks and
 * leaves the rest to US4's delivery.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(CredentialRepository) private readonly credentials: CredentialRepository,
    @Inject(HandleClaimRepository) private readonly claims: HandleClaimRepository,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
  ) {}

  /**
   * FR-001. CREATES THE PERSON, CLAIMS THE HANDLE AND STORES THE CREDENTIAL IN
   * ONE TRANSACTION.
   *
   * All or none. A person without their credential is somebody who cannot sign
   * in as themselves and whose handle is now taken; a credential without the
   * person is somebody who can sign in as nobody. Either half alone is worse
   * than refusing, which is what `transact` is for.
   *
   * ────────────────────────────────────────────────────────────────────────
   * THE REFUSALS ARE THE INTERESTING PART, AND THEY ARE NOT SYMMETRICAL WITH
   * SIGN-IN'S
   * ────────────────────────────────────────────────────────────────────────
   *
   * Sign-up MAY say "that address is already in use" (FR-002, contract §1) and
   * sign-in may NOT (FR-009). That looks inconsistent and is not: a person
   * choosing an address has to be told, or they are stuck at a form that
   * refuses them for a reason nobody will state. The enumeration this permits is
   * real and is the accepted cost — it is bounded by the rate limit, and the
   * alternative is a sign-up that cannot be completed.
   *
   * The validation order matters too: the password floor is checked BEFORE
   * anything is written (contract §1), so a refused sign-up never leaves a
   * half-made account behind.
   */
  async signUp(input: SignUpInput): Promise<Credentialed> {
    const email = CredentialRepository.fold(input.email);
    const handle = HandleClaimRepository.fold(input.handle);
    const displayName = input.displayName.trim();

    const fail = (field: string, message: string): never => {
      /**
       * FR-007: the refusal names the field. The app keeps the rest of what was
       * typed, and it can only do that if it is told which one to clear.
       */
      throw new DomainError(HttpStatus.BAD_REQUEST, 'Invalid sign-up', message, {
        errors: [{ field, message }],
      });
    };

    if (!EMAIL_PATTERN.test(email)) fail('email', 'Enter an email address.');
    if (input.password.length < PASSWORD_MIN_LENGTH) fail('password', PASSWORD_FLOOR_MESSAGE);
    if (!HANDLE_PATTERN.test(handle)) {
      fail('handle', 'Use 3–30 characters: lower case letters, numbers or underscores.');
    }
    if (displayName.length < 1 || displayName.length > 50) {
      fail('displayName', 'Enter a name between 1 and 50 characters.');
    }

    /**
     * A COURTESY CHECK, NOT THE CONSTRAINT.
     *
     * These two reads exist so the common case gets a refusal naming the right
     * field instead of an opaque transaction failure. They are NOT what makes
     * either claim unique — the conditional writes below are, and they are what
     * decides the two-simultaneous-requests case these reads cannot see.
     *
     * Saying so here because a reader who takes these for the constraint will
     * eventually "simplify" the conditions away, which is exactly the
     * read-then-write that passes every sequential test.
     */
    if (await this.credentials.findByEmail(email)) {
      fail('email', 'That address already has an account. Sign in instead.');
    }
    if (await this.claims.find(handle)) fail('handle', 'That handle is taken.');

    const userId = ulid();
    const credential: CredentialItem = {
      userId,
      emailFolded: email,
      password: await derivePassword(input.password),
      createdAt: new Date().toISOString(),
    };

    try {
      await this.people.create(
        {
          userId,
          handle,
          displayName,
          followerCount: 0,
          followingCount: 0,
          interestFollowCount: 0,
          notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
          status: 'active',
          createdAt: credential.createdAt,
        },
        [this.credentials.createItem(credential)],
      );
    } catch {
      /**
       * THE TRANSACTION LOST A RACE, and this is the path SC-005 exercises.
       *
       * One of the two conditional writes refused, so somebody claimed the
       * address or the handle between the courtesy read above and this write.
       * Which one is not knowable from here without another read, and another
       * read is another race — so the refusal names both possibilities rather
       * than guessing, and the person retries.
       *
       * 409 rather than 400: nothing they typed was invalid, it stopped being
       * available.
       */
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Already taken',
        'That address or handle was just taken. Try again.',
      );
    }

    return { token: await this.issue(userId), userId, handle };
  }

  /**
   * FR-008, FR-009. AND THE COST IS PAID WHETHER OR NOT THE ADDRESS EXISTS.
   *
   * ────────────────────────────────────────────────────────────────────────
   * THE EARLY RETURN IS THE BUG, AND IT IS THE OBVIOUS IMPLEMENTATION
   * ────────────────────────────────────────────────────────────────────────
   *
   * Look up, return early when absent: satisfies the message, satisfies the
   * status, and gives the answer away in the timing by two orders of magnitude,
   * because the absent case skips a deliberately ~100ms key derivation. That is
   * not a subtle leak — it is measurable over a phone network by anybody with a
   * list of addresses.
   *
   * So an unknown address is verified against `DUMMY_STORED`: a real stored
   * value, wrapping a random password nobody holds, derived with the same
   * parameters. The comparison always fails and always costs the same.
   *
   * `verifyPassword` never throws for this reason too — a malformed stored value
   * returning 500 would leak by error precisely what this hides by timing.
   */
  async signIn(input: SignInInput): Promise<Credentialed> {
    const email = CredentialRepository.fold(input.email);
    const credential = await this.credentials.findByEmail(email);

    const ok = await verifyPassword(input.password, credential?.password ?? DUMMY_STORED);

    /**
     * ONE REFUSAL FOR BOTH CASES — one message, one status, one cost.
     *
     * Built after the verification rather than before it, so that no branch
     * above can return without having paid. An `if (!credential) throw` here
     * would be the leak reintroduced one line further down.
     */
    if (!ok || !credential) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'Sign-in failed',
        'That email address and password do not match an account.',
      );
    }

    /**
     * A CREDENTIAL ROW WITHOUT A PERSON SHOULD BE IMPOSSIBLE — they are written
     * in one transaction — so this is not an expected path. It is still checked,
     * because returning a token for a person who does not exist would produce a
     * signed-in session where every screen 404s, which is 003's "a signed token
     * is not an identity" in a new place.
     */
    const person = await this.people.findById(credential.userId);
    if (!person) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'Sign-in failed',
        'That email address and password do not match an account.',
      );
    }

    return {
      token: await this.issue(credential.userId, credential.epoch),
      userId: credential.userId,
      handle: person.handle,
    };
  }

  private async issue(userId: string, epoch?: number): Promise<string> {
    if (!this.identity.issueForPerson) {
      throw new DomainError(
        HttpStatus.NOT_IMPLEMENTED,
        'Identity unavailable',
        'This deployment cannot issue credentials.',
      );
    }
    return this.identity.issueForPerson(userId, epoch === undefined ? {} : { epoch });
  }
}
