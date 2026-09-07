import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import { keys } from './keys';

export interface BlockItem {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

/**
 * A18. FR-044: a block hides content in BOTH directions, so the visibility filter
 * must check both. Testing only one direction is the easy mistake called out in
 * contracts/visibility-matrix.md - hence `existsBetween`, which takes an unordered
 * pair, rather than a one-way `isBlockedBy`.
 */
@Injectable()
export class BlockRepository extends BaseRepository {
  async existsBetween(a: string, b: string): Promise<boolean> {
    const [ab, ba] = await Promise.all([
      this.getItem<BlockItem>(keys.block(a, b)),
      this.getItem<BlockItem>(keys.block(b, a)),
    ]);
    return ab !== null || ba !== null;
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    await this.putItem({
      ...keys.block(blockerId, blockedId),
      ...keys.blockInverted(blockedId, blockerId),
      type: 'Block',
      blockerId,
      blockedId,
      createdAt: new Date().toISOString(),
    });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.deleteItem(keys.block(blockerId, blockedId));
  }
}
