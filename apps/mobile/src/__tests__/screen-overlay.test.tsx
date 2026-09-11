import { render, screen } from '@testing-library/react-native';
import type { AppData } from '../data';
import { DataProvider } from '../data-provider';
import { Shell, type Route } from '../App';

/**
 * ===========================================================================
 * THE OVERLAY SCREEN SEAM IS ACTUALLY WIRED.
 * ===========================================================================
 *
 * `OVERLAY_SCREENS` is empty upstream, so `App.tsx` handling the `overlay` route
 * and `App.tsx` ignoring it look identical from every other test and every boot
 * here. Delete the case and nothing in this repository notices; a fork finds out
 * when their screen renders blank.
 *
 * So the registry is mocked NON-EMPTY for this file. It is the same argument as
 * `overlay-modules.spec.ts` on the API side, and the same list of defects behind
 * it: a "Following" tab with no feed, `readAt` with no writer, a `follow`
 * notification kind nothing published.
 *
 * NOTHING UPSTREAM PUSHES AN OVERLAY ROUTE — a fork's own screen does — which is
 * why `Shell` takes an `initialStack`. Without it this seam could not be reached
 * to be tested at all.
 *
 * Mocked at the top rather than per-test with `isolateModules`: an isolated
 * registry hands `App.tsx` its own copy of React and of `data-provider`, so the
 * provider rendered here and the `useData` called in there are two different
 * contexts and Shell throws before reaching any of this. One registry, one
 * React.
 */
jest.mock('../overlay/screens', () => ({
  OVERLAY_SCREENS: {
    widgets: {
      title: 'My widgets',
      render: ({ params }: { params: Record<string, unknown> }) => {
        // Required inside the factory: jest hoists this above the imports, so
        // nothing from module scope is in scope yet.
        const react = require('react') as typeof import('react');
        const rn = require('react-native') as typeof import('react-native');
        return react.createElement(
          rn.Text,
          { testID: 'fork-widgets' },
          `widgets for ${String(params.owner ?? 'nobody')}`,
        );
      },
    },
  },
}));

/**
 * The overlay screen is the FORK's component and touches no data. Shell itself
 * only reads `session.isSignedIn`, so this is deliberately the smallest stub
 * that lets it mount rather than a copy of the full fake data layer - which
 * would be a second thing to keep in step with the real one.
 */
const minimalData = {
  session: { isSignedIn: async () => false },
} as unknown as AppData;

const renderShell = (initialStack?: Route[]) =>
  render(
    <DataProvider value={minimalData}>
      <Shell {...(initialStack ? { initialStack } : {})} />
    </DataProvider>,
  );

describe('the overlay screen registry', () => {
  it('is empty in this repository', () => {
    // The REAL module, not the mock above: upstream's promise that nothing
    // ships here. A screen accidentally committed would be in everyone's build.
    const actual = jest.requireActual<typeof import('../overlay/screens')>('../overlay/screens');
    expect(actual.OVERLAY_SCREENS).toEqual({});
  });

  it('renders a registered overlay screen - the case is really there', () => {
    renderShell([{ name: 'overlay', screen: 'widgets' }]);
    expect(screen.getByTestId('fork-widgets')).toBeTruthy();
  });

  it('passes the route params through', () => {
    renderShell([{ name: 'overlay', screen: 'widgets', params: { owner: 'jo' } }]);
    expect(screen.getByText('widgets for jo')).toBeTruthy();
  });

  it('titles the header from the registry, not the literal route name', () => {
    renderShell([{ name: 'overlay', screen: 'widgets' }]);
    // Without the registry lookup every fork screen would head the bar with the
    // word "overlay".
    expect(screen.getByText('My widgets')).toBeTruthy();
    expect(screen.queryByText('overlay')).toBeNull();
  });

  /**
   * AN UNKNOWN KEY IS VISIBLE, NOT BLANK.
   *
   * A blank body is the failure this codebase keeps finding, and it looks
   * exactly like a screen that rendered and had nothing to say. A fork
   * mistyping a key should see which key, on the screen, immediately.
   */
  it('names the missing key instead of rendering nothing', () => {
    renderShell([{ name: 'overlay', screen: 'wigdets' }]);
    expect(screen.getByTestId('overlay-screen-missing')).toBeTruthy();
    // TWICE: the body names it, and the header falls back to the key because
    // the registry has no title for it either. Both are what a fork that
    // mistyped needs to see, so this asserts the count rather than "at least
    // one" - a single match would mean one of the two went quiet.
    expect(screen.getAllByText(/wigdets/)).toHaveLength(2);
    expect(screen.queryByTestId('fork-widgets')).toBeNull();
  });

  it('an overlay screen is a PUSHED screen, so it has no tab bar', () => {
    // 005/J-21, which cost two device runs: `App` renders the tab bar only at
    // the root of the stack. A fork writing a Maestro flow against a tab here
    // would wait thirty seconds for something that cannot exist.
    renderShell([{ name: 'overlay', screen: 'widgets' }]);
    expect(screen.queryByTestId('tab-feed')).toBeNull();
    expect(screen.getByTestId('nav-back')).toBeTruthy();
  });

  it('with no initialStack the app still opens on the tabs', () => {
    // The default has to stay the tabs: `initialStack` is a seam, not a change
    // of where the app starts.
    renderShell();
    expect(screen.getByTestId('tab-feed')).toBeTruthy();
  });
});
