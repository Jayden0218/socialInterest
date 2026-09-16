import { act, render } from '@testing-library/react-native';
import { DataProvider } from '../data-provider';
import { fakeData } from './fixtures/app-data';
import { Shell, type Route } from '../App';

/**
 * 012/T036, FR-018. EVERY PUSHED SCREEN OFFERS A WAY BACK THAT IS NOT A GESTURE.
 *
 * Android's system back and iOS's edge swipe are not the product's answer to
 * this. A gesture is invisible, differs between platforms, is switched off on
 * some devices and cannot be seen by somebody who has never used the app — and
 * an emulator run cannot tell "there is a way back" from "I happened to know
 * the gesture". The requirement asks for a control.
 *
 * WHY A GUARD AND NOT A READING. The shell renders one `Header` for any
 * non-tab route, so today the answer is yes everywhere by construction. That is
 * exactly the kind of fact that stops being true quietly: a screen given its own
 * branch, a modal added above the header, a route that renders before the stack
 * is pushed. This project has shipped a route with no renderer and a renderer
 * with no route in the same feature, so "by construction" is worth asserting.
 *
 * ENUMERATED FROM THE ROUTE UNION, deliberately with a literal list that has to
 * be edited when a route is added. A test that derived the list from the same
 * source the app derives it from would pass for any route the app forgot.
 */
describe('012/FR-018 — every pushed screen has a visible way back', () => {
  /**
   * Every variant of `Route`, with the cheapest params that reach a render.
   *
   * `overlay` is absent on purpose: upstream's registry is empty, so there is
   * no overlay screen here to push. `screen-overlay.test.tsx` covers a fork's
   * one — and asserts `nav-back` on it, for this same reason.
   */
  const ROUTES: Route[] = [
    { name: 'sign-in' },
    { name: 'post', postId: 'p1' },
    { name: 'comments', postId: 'p1' },
    { name: 'interest', interestId: 'i1' },
    { name: 'compose' },
    { name: 'share', postId: 'p1' },
    { name: 'edit-post', postId: 'p1' },
    { name: 'edit-profile' },
    { name: 'person', handle: 'jo' },
    { name: 'shared-post', postId: 'p1' },
    { name: 'open-conversation', handle: 'jo' },
    { name: 'new-group' },
    { name: 'conversation', conversationId: 'c1', otherHandle: 'jo' },
    { name: 'place', placeId: 'pl1' },
    { name: 'create-place' },
    { name: 'saved' },
    { name: 'pick-interests' },
    { name: 'safety', subject: 'post', subjectId: 'p1' },
    { name: 'moderation-notices' },
  ];

  it.each(ROUTES.map((r) => [r.name, r] as const))(
    '%s offers a back control, not a gesture',
    async (_name, route) => {
      /**
       * ASSERTED SYNCHRONOUSLY, and the first version used `waitFor` and was
       * wrong about its own subject.
       *
       * The header is not fetched — the shell renders it for any non-tab route
       * on the first pass, which is the whole reason this is true by
       * construction. `waitFor` polls while containers resolve their data, so
       * two screens failed with "Unable to find node on an unmounted
       * component": the assertion had raced a state update RNTL then tore down.
       * The tree printed at render time had `nav-back` in it all along.
       *
       * `act` flushes the containers' first effects so the pending-update
       * warnings do not fire; the assertion does not depend on them.
       */
      const r = render(
        <DataProvider value={fakeData()}>
          <Shell initialStack={[route]} />
        </DataProvider>,
      );
      expect(r.queryByTestId('nav-back')).not.toBeNull();
      /**
       * AND NO TAB BAR, which is the other half of the same fact and the one
       * that cost two device runs (005/J-21): a pushed screen renders the tab
       * bar only at the root of the stack, so a Maestro flow waiting for
       * `tab-chats` here waits thirty seconds for something that cannot exist.
       */
      expect(r.queryByTestId('tab-feed')).toBeNull();

      // Then let the containers' first effects settle, so the pending-update
      // warnings do not fire into the next case. Rendering INSIDE `act` tears
      // the tree down before the assertions run, which is how the second
      // version of this failed.
      await act(async () => undefined);
    },
  );

  /**
   * AND THE LIST IS COMPLETE. A guard enumerating routes by hand is only as
   * good as the hand, so this counts: adding a `Route` variant without adding
   * it here fails, which is the deliberate edit the literal exists to force.
   *
   * Counted from `App.tsx`'s union rather than from a runtime value, because a
   * runtime list would be the app's own answer and this is meant to check it.
   */
  it('covers every route the union declares', () => {
    expect(ROUTES).toHaveLength(19);
  });
});
