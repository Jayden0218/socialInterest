/**
 * The routing-probe types, in one place so an OVERLAY can supply probes.
 *
 * These were inner declarations of surface-routing.spec.ts. They are extracted
 * for exactly one reason: `tests/overlay/probes.overlay.ts` has to be able to
 * declare a probe for a surface the overlay adds, and a type it cannot import
 * is a type it would have to restate. A restated interface is the `ApiPage<T>`
 * defect in miniature - two declarations that agree with each other today and
 * with nothing tomorrow.
 *
 * Nothing else changed: surface-routing.spec.ts still owns every base probe and
 * still owns the assertions.
 */
import type { VisibilityFilter } from '../../src/visibility/visibility.filter';
import type { PostQueryService } from '../../src/modules/posts/post-query.service';

export interface Ctx {
  filter: VisibilityFilter;
  queries: PostQueryService;
  decide: jest.SpyInstance;
  filterMany: jest.SpyInstance;
  getById: jest.SpyInstance;
  /**
   * 005. The block repository itself, spied.
   *
   * A review does not call `filter.decide` - it goes through the second entry
   * point, which delegates to the shared rules. Watching the block repository is
   * what proves BOTH paths end at the same question.
   */
  blocksSpy: jest.SpyInstance;
}

export interface Probe {
  /** Must match a `name` in SURFACES exactly. */
  surface: string;
  /** Invokes the real read path. Returns nothing; the assertion is the spy. */
  run: (ctx: Ctx) => Promise<unknown>;
  /**
   * A surface that returns no posts AT ALL proves its claim structurally rather
   * than by calling the filter. Only `interest search` qualifies, and it must
   * say why.
   */
  returnsNoPosts?: string;
  /**
   * 005. This surface reaches the boundary through the second entry point, so
   * `filter.decide` is correctly never called - the probe asserts on the shared
   * block check itself instead.
   */
  consultsSharedBlockCheck?: boolean;
}
