import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import { keys } from './keys';

export interface ReactionItem {
  postId: string;
  userId: string;
  createdAt: string;
}

/**
 * A16. The KEY STRUCTURE enforces "at most one reaction per person per post"
 * (FR-039) - a second reaction is the same item, so the constraint holds even
 * under concurrent taps without any application-level check.
 */
@Injectable()
export class ReactionRepository extends BaseRepository {
  async exists(postId: string, userId: string): Promise<boolean> {
    return (await this.getItem<ReactionItem>(keys.reaction(postId, userId))) !== null;
  }
}
