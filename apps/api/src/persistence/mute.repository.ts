import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import { keys, SK_PREFIX } from './keys';

/**
 * 008/US12, FR-039 — A50. LESS OF THIS, WITHOUT BLOCKING.
 *
 * ONE DIRECTION ONLY, and that is the whole design. A mute row lives in the
 * muter's partition and nowhere else, so the muted person cannot query it, and
 * FR-040 ("not inferable by its subject") is true by construction rather than by
 * remembering to filter it out of every response.
 *
 * The contrast with `BlockRepository` is deliberate: a block is symmetric and
 * indexed both ways because it must be enforceable from either side. A mute must
 * be invisible from one.
 */
@Injectable()
export class MuteRepository extends BaseRepository {
  async mute(muterId: string, mutedId: string): Promise<void> {
    await this.putItem({
      ...keys.mute(muterId, mutedId),
      type: 'Mute',
      muterId,
      mutedId,
      createdAt: new Date().toISOString(),
    });
  }

  async unmute(muterId: string, mutedId: string): Promise<void> {
    await this.deleteItem(keys.mute(muterId, mutedId));
  }

  /**
   * Every id this person has muted.
   *
   * Read whole rather than asked per candidate: a feed page considers dozens of
   * authors, and a lookup each would be dozens of reads on the hot path. The set
   * is small by nature — muting is a deliberate act — and bounded here so a
   * pathological account cannot make a feed request unbounded.
   */
  async listMuted(muterId: string, limit = 500): Promise<Set<string>> {
    const page = await this.query<{ mutedId: string }>(`USER#${muterId}`, {
      skPrefix: SK_PREFIX.mute,
      ascending: true,
      limit,
      cursor: null,
    });
    return new Set(page.items.map((m) => m.mutedId));
  }
}
