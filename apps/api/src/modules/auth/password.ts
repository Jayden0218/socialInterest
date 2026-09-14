import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * 011/T011. PASSWORD DERIVATION — `scrypt`, FROM NODE'S OWN `crypto`.
 *
 * Research R2: Argon2id is the better algorithm on paper and every Node
 * implementation of it is a native addon — a compile step in CI, on a laptop,
 * and in whatever container this eventually runs in, for a product with one
 * user. `scrypt` is memory-hard, ships with the runtime, and needs no build
 * toolchain. `pbkdf2` is also in the standard library and is not memory-hard;
 * `bcrypt` is a native addon and silently truncates past 72 bytes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE PARAMETERS ARE STORED WITH THE HASH, AND THAT IS THE LOAD-BEARING PART
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A stored value that records HOW it was derived can be re-derived differently
 * later — the cost raised as machines get faster, the algorithm replaced
 * entirely — one account at a time, on the next successful sign-in, with no
 * migration and no flag day. A stored value that records only bytes is a
 * decision that had to be right on the first day.
 *
 * Format: `scrypt$N$r$p$<salt base64>$<hash base64>`. Self-describing and
 * printable, so a stored value can be read by a person diagnosing something
 * without a decoder.
 */

/**
 * OWASP's floor for scrypt at the time of writing: N=2^17, r=8, p=1.
 *
 * These are a COST, deliberately. Roughly 100ms per derivation on this hardware
 * is the point — it is what makes an offline guessing attack expensive, and it
 * is also why sign-in must pay that cost even for an address with no account
 * (R3), because not paying it is the timing leak.
 */
const PARAMS = { N: 131_072, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * `maxmem` must be raised to fit the parameters above.
 *
 * Node's default is 32 MiB and scrypt needs roughly `128 * N * r` — about
 * 134 MiB here — so the default makes the call THROW rather than run slowly.
 * Left at the default, every derivation fails, which the first version of a
 * password module discovers as a 500 on its own happy path.
 */
const MAX_MEM = 256 * 1024 * 1024;

export interface StoredPassword {
  algorithm: string;
  params: { N: number; r: number; p: number };
  salt: Buffer;
  hash: Buffer;
}

export async function derivePassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

export function parseStored(stored: string): StoredPassword {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    throw new Error('unrecognised stored password format');
  }
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    throw new Error('unrecognised stored password parameters');
  }
  return {
    algorithm: 'scrypt',
    params,
    salt: Buffer.from(salt, 'base64'),
    hash: Buffer.from(hash, 'base64'),
  };
}

/**
 * VERIFIES, AND NEVER THROWS.
 *
 * A malformed stored value is a refusal. That is not defensive tidiness: the
 * dummy hash sign-in derives against for an unknown address (R3) goes through
 * this exact path, so an exception here would be a 500 on the one code path
 * whose whole purpose is to be indistinguishable from the ordinary one —
 * leaking by error precisely what the timing work exists to hide.
 *
 * `timingSafeEqual` rather than `===`, and it is not superstition: a byte
 * comparison returns as soon as it finds a difference, which tells an attacker
 * how much of the hash their guess matched. It also THROWS on buffers of
 * different lengths rather than returning false, so the length is checked first
 * — and checking it is safe to do variably, because the length of a hash is not
 * a secret.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  let parsed: StoredPassword;
  try {
    parsed = parseStored(stored);
  } catch {
    return false;
  }

  try {
    const derived = await scrypt(password, parsed.salt, parsed.hash.length, {
      ...parsed.params,
      maxmem: MAX_MEM,
    });
    if (derived.length !== parsed.hash.length) return false;
    return timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/**
 * A VALID STORED VALUE FOR AN ADDRESS THAT HAS NO ACCOUNT (research R3).
 *
 * Sign-in derives against this when it finds nothing, so that a refusal for an
 * unknown address costs the same ~100ms as a refusal for a wrong password. The
 * obvious implementation — look up, return early when absent — satisfies the
 * message and gives the answer away in the timing by two orders of magnitude.
 *
 * Built ONCE at module load rather than per request: deriving a throwaway every
 * time would double the cost of the unknown-address path and reintroduce the
 * difference in the other direction.
 *
 * The password it wraps is random and is never stored anywhere, so no
 * credential this produces can ever be verified by anybody.
 */
export const DUMMY_STORED = (() => {
  const salt = randomBytes(SALT_LENGTH);
  // Synchronous at import: this runs once, before the process serves anything.
  const hash = require('node:crypto').scryptSync(randomBytes(32), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  }) as Buffer;
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$');
})();
