import type { ModuleMetadata } from '@nestjs/common';

/**
 * OVERLAY MODULES — empty upstream, filled in by a downstream fork.
 *
 * See ./README.md. `AppModule` spreads this into its `imports`, so a fork adds
 * a feature by writing a Nest module and listing it here. Upstream never edits
 * this file, and `app.module.ts` gains no line per fork feature — which is the
 * point: `app.module.ts` is 60 lines that both sides would otherwise append to,
 * and an import list is the easiest kind of merge to resolve wrongly, because
 * both sides' versions look correct.
 *
 * `imports` ONLY, deliberately. `AppModule` also declares `controllers` and
 * `providers`, and neither is offered as a seam:
 *
 *  - controllers belong to the module that owns them, so a fork's controller
 *    arrives through its own module here and needs nothing at app level.
 *  - the app-level `providers` are the two global guards. An overlay hook there
 *    would be a supported way to replace `AuthGuard` from outside the file that
 *    declares it, and "which guard authenticates this app" must have one answer
 *    readable in one place.
 *
 * Nest being Nest, a module listed here CAN still register an `APP_GUARD`
 * provider of its own — that is how Nest composes and upstream cannot prevent
 * it. It is called out in ./README.md as a fork's own review item rather than
 * left as a surprise, and `overlay-modules.spec.ts` pins the app-level guard
 * list so that upstream's two cannot be quietly changed here.
 */
export const OVERLAY_MODULES: NonNullable<ModuleMetadata['imports']> = [];
