import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Patch, Req } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { zodBody } from '../../common/http/validation';
import { PersonRepository } from '../../persistence/person.repository';
import { UploadRepository } from '../../persistence/upload.repository';
import { ProfileProjection } from './profile.projection';

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
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to change' });

@Controller('me')
export class MeController {
  constructor(
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(UploadRepository) private readonly uploads: UploadRepository,
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
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
    };
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
