import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { zodBody } from '../../common/http/validation';
import { PersonRepository } from '../../persistence/person.repository';
import { UploadRepository } from '../../persistence/upload.repository';
import { ProfileProjection } from './profile.projection';
import { PersonFollowService } from './person-follow.service';

const profileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(50),
    bio: z.string().max(300),
    notificationPrefs: z
      // 004/FR-031 adds `message`. Absent still means on, so no backfill.
      .object({
        reaction: z.boolean(),
        comment: z.boolean(),
        follow: z.boolean(),
        message: z.boolean(),
      })
      .partial(),
    /**
     * 008/FR-017 — SET OR REMOVE A PROFILE PICTURE.
     *
     * An UPLOAD ID, never a key. The server looks up the record it issued and
     * takes the key from there, because 002's second defect was a
     * client-supplied key letting a post point at another person's media. Null
     * removes the avatar; absent leaves it alone, like every other field here.
     */
    avatarUploadId: z.string().min(1).nullable(),
    /**
     * 008/FR-043. THE ONLY WRITER OF ACCOUNT PRIVACY.
     *
     * Setting is not deciding — `privacy-is-not-per-surface.spec.ts` allows this
     * file for that reason and no other. Nothing here rebuilds an index or
     * touches a follow row: flipping it changes what the boundary answers on the
     * next read, everywhere at once (FR-044), and the followers who already have
     * access keep it (FR-045).
     */
    accountPrivacy: z.enum(['open', 'private']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to change' });

@Controller('me')
export class MeController {
  constructor(
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(UploadRepository) private readonly uploads: UploadRepository,
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
    @Inject(PersonFollowService) private readonly followService: PersonFollowService,
  ) {}

  /** FR-002, FR-049. */
  @Get()
  async me(@Req() req: AppRequest) {
    const person = await this.people.findById(req.viewer!.userId);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    return {
      // 008/US5. `GET /v1/me` returned NO avatarUrl at all - your own face was
      // missing from your own profile response. Through the one projection now.
      ...(await this.profiles.toPublicProfile(person)),
      bio: person.bio ?? null,
      followerCount: person.followerCount,
      followingCount: person.followingCount,
      interestFollowCount: person.interestFollowCount,
      notificationPrefs: person.notificationPrefs,
      /**
       * 008/FR-043. HOW THE REQUEST LIST GETS FOUND.
       *
       * No notification kind was added for a follow request (see
       * `PersonFollowService.follow` for why), so without a number here the
       * list is a screen that exists and nothing points at. A count is the
       * smallest thing that makes it reachable, and it is a count of rows this
       * person can already read.
       */
      pendingFollowRequests: (
        await this.followService.pendingRequests(person.userId, { limit: 50 })
      ).items.length,
    };
  }

  /**
   * A52 / 008/FR-043 — REQUESTS WAITING ON ME.
   *
   * On `/me` rather than on `/people/:handle`, because whose requests these are
   * is not a parameter: there is exactly one person who may read them and they
   * are the caller. A handle in the path would be a route that has to check it
   * matches the viewer, which is a check that can be forgotten.
   */
  @Get('follow-requests')
  async followRequests(
    @Req() req: AppRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = await this.followService.pendingRequests(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });
    const items = await Promise.all(
      page.items
        .filter((r) => r.person !== null)
        .map(async (r) => ({
          ...(await this.profiles.toPublicProfile(r.person!)),
          requestedAt: r.follow.followedAt,
        })),
    );
    return {
      items,
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: items.length === 0 ? 'no_follow_requests' : null,
      },
    };
  }

  /** FR-043. Approve. 404 if there is no request from this person. */
  @Put('follow-requests/:handle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveFollowRequest(
    @Req() req: AppRequest,
    @Param('handle') handle: string,
  ): Promise<void> {
    await this.followService.approveRequest(req.viewer!.userId, handle);
  }

  /**
   * FR-043. Decline, which DELETES the row rather than remembering the refusal
   * — see `PersonFollowService.declineRequest`.
   */
  @Delete('follow-requests/:handle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async declineFollowRequest(
    @Req() req: AppRequest,
    @Param('handle') handle: string,
  ): Promise<void> {
    await this.followService.declineRequest(req.viewer!.userId, handle);
  }

  @Patch()
  async update(@Req() req: AppRequest, @Body() body: unknown) {
    const patch = zodBody(profileUpdateSchema, body);
    const person = await this.people.findById(req.viewer!.userId);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');

    /**
     * 008/FR-017, FR-018. Resolved against the server's OWN upload record.
     *
     * Ownership is checked: an upload issued to somebody else is refused rather
     * than silently ignored, because silently ignoring it would let a client
     * believe it had set an avatar it had not.
     */
    let avatarKey: string | null | undefined;
    if (patch.avatarUploadId !== undefined) {
      if (patch.avatarUploadId === null) {
        avatarKey = null;
      } else {
        const upload = await this.uploads.get(patch.avatarUploadId);
        if (!upload || upload.userId !== person.userId) {
          throw new DomainError(HttpStatus.NOT_FOUND, 'No such upload');
        }
        // FR-018: the same processing and stripping path as any other image.
        // `upload.service.ts` maps kind `avatar` to `image`, so a video upload
        // quoted here is the wrong kind and is refused.
        if (upload.kind !== 'image') {
          throw new DomainError(HttpStatus.CONFLICT, 'An avatar must be an image');
        }
        avatarKey = upload.key;
      }
    }

    await this.people.updateProfile(person.userId, {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(avatarKey !== undefined ? { avatarKey } : {}),
      ...(patch.accountPrivacy !== undefined ? { accountPrivacy: patch.accountPrivacy } : {}),
      // Merged, not replaced: a client sending one toggle must not silently
      // reset the categories it did not mention.
      ...(patch.notificationPrefs
        ? { notificationPrefs: { ...person.notificationPrefs, ...patch.notificationPrefs } }
        : {}),
    });
    return this.me(req);
  }

  /**
   * FR-003. Returns immediately with the retention outcome; removal and
   * anonymisation proceed asynchronously. Followers-only content becomes
   * inaccessible as soon as this returns, because the visibility filter treats
   * a non-active author as having no followers.
   */
  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  async deleteAccount(@Req() req: AppRequest) {
    const person = await this.people.findById(req.viewer!.userId);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    await this.people.setStatus(person.userId, 'deleting');
    return {
      status: 'deleting',
      purgeCompletesBy: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };
  }
}
