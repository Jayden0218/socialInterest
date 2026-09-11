import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OVERLAY_MODULES } from '../../src/overlay/modules';

/**
 * ===========================================================================
 * THE OVERLAY MODULE SEAM IS ACTUALLY WIRED.
 * ===========================================================================
 *
 * `OVERLAY_MODULES` is empty upstream, so `AppModule` registering it and
 * `AppModule` ignoring it look IDENTICAL from every test, every boot and every
 * green CI run here. Delete the `...OVERLAY_MODULES` line from app.module.ts
 * and nothing in this repository notices - the seam just silently stops
 * existing, and a fork discovers it by their feature never loading.
 *
 * That is this project's most-repeated defect shape, and the list is long
 * enough to be a pattern rather than bad luck: `readAt` declared with nothing
 * writing it, `avatarKey` with no writer, a "Following" tab with no feed, a
 * `follow` notification kind nothing published, ten photographs the server
 * returned and four client call sites read `media[0]` from.
 *
 * So the module is loaded here with a NON-EMPTY overlay and the fake module is
 * looked for in the metadata Nest actually reads. Nothing else proves the line
 * is there.
 */

@Module({})
class FakeOverlayModule {}

@Module({})
class SecondFakeOverlayModule {}

type Ctor = new (...args: never[]) => unknown;

/**
 * Load `app.module.ts` against a substituted overlay barrel.
 *
 * `isolateModules` gives the require a fresh registry so each case composes its
 * own graph; a top-level import would bind once, against the empty overlay, and
 * every case below would then assert about a module graph that has no overlay
 * in it - passing, and meaning nothing.
 */
function loadAppModuleWith(modules: unknown[]): Ctor {
  let AppModule!: Ctor;
  jest.isolateModules(() => {
    jest.doMock('../../src/overlay/modules', () => ({ OVERLAY_MODULES: modules }));
    AppModule = (require('../../src/app.module') as { AppModule: Ctor }).AppModule;
  });
  return AppModule;
}

const importsOf = (AppModule: Ctor): unknown[] =>
  (Reflect.getMetadata('imports', AppModule) as unknown[]) ?? [];

afterEach(() => {
  jest.dontMock('../../src/overlay/modules');
  jest.resetModules();
});

describe('the overlay module barrel', () => {
  it('is empty in this repository', () => {
    // Upstream's promise, asserted. A module accidentally committed here would
    // ship in everyone's build.
    expect(OVERLAY_MODULES).toEqual([]);
  });

  it('is spread into AppModule.imports - the line is really there', () => {
    const imports = importsOf(loadAppModuleWith([FakeOverlayModule]));
    expect(imports).toContain(FakeOverlayModule);
  });

  it('registers every overlay module, not just the first', () => {
    const imports = importsOf(loadAppModuleWith([FakeOverlayModule, SecondFakeOverlayModule]));
    expect(imports).toContain(FakeOverlayModule);
    expect(imports).toContain(SecondFakeOverlayModule);
  });

  it('adds the overlay LAST, after every base module', () => {
    // Ordering is a real property, not tidiness: a fork's module may depend on
    // anything upstream provides, and nothing upstream may depend on a fork's.
    // Registering the overlay earlier would make the second direction possible
    // to write by accident.
    const imports = importsOf(loadAppModuleWith([FakeOverlayModule]));
    expect(imports[imports.length - 1]).toBe(FakeOverlayModule);
  });

  it('an empty overlay adds nothing to the base import list', () => {
    const withEmpty = importsOf(loadAppModuleWith([]));
    const withOne = importsOf(loadAppModuleWith([FakeOverlayModule]));
    expect(withEmpty).not.toContain(FakeOverlayModule);
    expect(withOne.length).toBe(withEmpty.length + 1);
  });

  /**
   * THE APP-LEVEL GUARDS ARE NOT A SEAM, and this is what keeps that true.
   *
   * `modules.ts` offers `imports` only, on the argument that "which guard
   * authenticates this app" must have one answer readable in one place. That
   * argument is worth nothing unless the two providers stay where they are, so
   * they are pinned - including against a change made while adding the overlay
   * line itself, which is exactly when app.module.ts is being edited.
   *
   * This does NOT claim a fork cannot register a global guard: a module listed
   * in the overlay can provide APP_GUARD, that is how Nest composes, and
   * src/overlay/README.md names it as the fork's own review item rather than
   * leaving it as a surprise.
   */
  it('leaves the app-level global guards exactly as they were', () => {
    const AppModule = loadAppModuleWith([FakeOverlayModule]);
    const providers = (Reflect.getMetadata('providers', AppModule) as
      | { provide?: unknown; useClass?: { name: string } }[]
      | undefined) ?? [];
    const globalGuards = providers
      .filter((p) => p.provide === APP_GUARD)
      .map((p) => p.useClass?.name);
    expect(globalGuards).toEqual(['AuthGuard', 'RateLimitGuard']);
  });
});
