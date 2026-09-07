import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';

export interface NamePolicyVerdict {
  allowed: boolean;
  reason?: 'prohibited_term' | 'malformed' | 'impersonation';
  detail?: string;
}

/**
 * FR-031: the content policy applies to sub-interest NAMES, not only to posts.
 *
 * Added after /speckit-analyze found the gap (finding G1): reporting existed,
 * but nothing screened a name at creation - so an abusive interest name would go
 * live and stay live until somebody happened to report it. Screening here means
 * the common case never reaches other people; reporting remains the backstop for
 * what screening misses.
 *
 * Deliberately conservative. This is a first-pass filter over an operator-curated
 * space, not a moderation system: it blocks the obvious, and FR-043 reporting
 * plus FR-045 human review handle the rest. Widening it into a general profanity
 * engine would produce false positives on legitimate interests.
 */

/**
 * Placeholder so the mechanism is testable without committing a slur list to
 * source control. Operators supply the real list through configuration.
 */
const PROHIBITED = ['example-prohibited-term'];

/** Names implying an official status the interest does not have. */
const IMPERSONATION = ['official', 'verified', 'admin', 'moderator', 'staff'];

const MAX_LENGTH = 50;
const MIN_LENGTH = 2;

/**
 * Code point ranges for characters that are invisible or change text direction.
 * Expressed numerically rather than as a regex character class so the ranges are
 * readable and the source file contains no invisible characters of its own.
 *
 * These matter because they smuggle a name past both this screen and the
 * duplicate check: two names that render identically but normalise differently.
 */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f], // C0 controls
  [0x007f, 0x009f], // DEL and C1 controls
  [0x00ad, 0x00ad], // soft hyphen
  [0x200b, 0x200f], // zero-width space/joiners, LTR/RTL marks
  [0x202a, 0x202e], // bidi embedding and override
  [0x2060, 0x206f], // word joiner, invisible operators, deprecated formatting
  [0xfeff, 0xfeff], // zero-width no-break space (BOM)
];

function hasInvisibleCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    for (const [lo, hi] of INVISIBLE_RANGES) {
      if (code >= lo && code <= hi) return true;
    }
  }
  return false;
}

@Injectable()
export class NamePolicy {
  evaluate(rawName: string): NamePolicyVerdict {
    const name = rawName.trim();
    const normalised = name.toLowerCase();

    if (hasInvisibleCharacter(rawName)) {
      return {
        allowed: false,
        reason: 'malformed',
        detail: 'Contains invisible or direction-changing characters',
      };
    }
    if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) {
      return {
        allowed: false,
        reason: 'malformed',
        detail: `Between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
      };
    }
    if (!/[a-z0-9]/i.test(name)) {
      return { allowed: false, reason: 'malformed', detail: 'Must contain a letter or number' };
    }

    for (const term of PROHIBITED) {
      if (normalised.includes(term)) {
        return { allowed: false, reason: 'prohibited_term', detail: 'Contains a prohibited term' };
      }
    }
    for (const term of IMPERSONATION) {
      if (new RegExp(`\\b${term}\\b`, 'i').test(normalised)) {
        return {
          allowed: false,
          reason: 'impersonation',
          detail: `"${term}" implies an official status this interest does not have`,
        };
      }
    }
    return { allowed: true };
  }

  /** Throws the problem-detail response the API returns for a violation. */
  assertAllowed(name: string): void {
    const verdict = this.evaluate(name);
    if (!verdict.allowed) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Interest name not allowed',
        verdict.detail ?? 'This name does not meet the content policy',
      );
    }
  }
}
