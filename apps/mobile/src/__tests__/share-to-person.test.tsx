import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render } from '@testing-library/react-native';
import { ShareAction } from '../features/engagement/ShareAction';

/**
 * 008/US4 — A POST CAN TRAVEL TO SOMEBODY YOU HAVE NEVER MESSAGED.
 *
 * The sheet listed ACCEPTED CONVERSATIONS ONLY, so a post could reach only
 * people you were already talking to. And its "Share" button called `onDone` —
 * it closed the sheet and shared nothing, anywhere, ever.
 *
 * Both are the pattern 008 exists to end: a control that is present and does
 * less than it says. The server needed no change for either (008/R4).
 */
const person = {
  userId: 'u9',
  handle: 'jrivers',
  displayName: 'Jo Rivers',
  bio: null,
  followerCount: 0,
  followingCount: 0,
  viewerIsFollowing: false,
};

describe('008/FR-011 the recipient picker', () => {
  it('searches as you type, once the query is worth a query', () => {
    const queries: string[] = [];
    const t = render(
      <ShareAction
        visibility="public"
        url="https://example.test/p/1"
        onCopy={() => undefined}
        onShare={() => undefined}
        onSearchPeople={(q) => queries.push(q)}
        people={[]}
        onSendToPerson={() => undefined}
      />,
    );
    fireEvent.changeText(t.getByTestId('share-recipient-search'), 'jri');
    expect(queries).toEqual(['jri']);
  });

  it('sends to a person by HANDLE, which is what a flow can predict', () => {
    const sent: string[] = [];
    const t = render(
      <ShareAction
        visibility="public"
        url="https://example.test/p/1"
        onCopy={() => undefined}
        onShare={() => undefined}
        onSearchPeople={() => undefined}
        people={[person]}
        onSendToPerson={(h) => sent.push(h)}
      />,
    );
    fireEvent.press(t.getByTestId('share-person-jrivers'));
    expect(sent).toEqual(['jrivers']);
  });

  it('will not send a PRIVATE post to anyone, the same rule the link warning states', () => {
    const t = render(
      <ShareAction
        visibility="private"
        url="https://example.test/p/1"
        onCopy={() => undefined}
        onShare={() => undefined}
        onSearchPeople={() => undefined}
        people={[person]}
        onSendToPerson={() => undefined}
      />,
    );
    expect(t.getByTestId('share-person-jrivers').props.accessibilityState?.disabled).toBe(true);
  });

  it('FR-014 shows ONE neutral refusal, with no word that could distinguish a block', () => {
    const t = render(
      <ShareAction
        visibility="public"
        url="https://example.test/p/1"
        onCopy={() => undefined}
        onShare={() => undefined}
        sendError="This post could not be sent to that person."
      />,
    );
    const text = t.getByTestId('share-send-error').props.children as string;
    // A distinguishable message IS the disclosure. The server answers `gone`
    // rather than `not-for-you` for a block for exactly this reason.
    expect(/block|forbidden|denied|not-for-you/i.test(text)).toBe(false);
  });

  it('does not render the picker at all when the caller supplies no handlers', () => {
    const t = render(
      <ShareAction
        visibility="public"
        url="https://example.test/p/1"
        onCopy={() => undefined}
        onShare={() => undefined}
      />,
    );
    expect(t.queryByTestId('share-to-person')).toBeNull();
  });
});

/**
 * 008/FR-015 — THE SHARE BUTTON HAS TO SHARE.
 *
 * A STRUCTURAL check, because the behavioural one is not available here: the
 * platform share sheet is native, and a component test that mocked it would be
 * asserting the mock. What can be checked is that the container reaches for the
 * platform mechanism at all — which it did not, for four features.
 *
 * The device flow `26-send-post.yaml` is what exercises the rest.
 *
 * Reads `ShareContainer.tsx` rather than the barrel, and is STRICTER for it.
 * While every container shared one 2,726-line file this assertion passed if
 * ANY of the twenty-five reached for `Share.share(` - it could have been the
 * compose screen's and this would have been green. Now it has to be this
 * container's.
 */
describe('008/FR-015 the share exit is wired to the platform', () => {
  it('ShareContainer calls the platform Share API', () => {
    const src = readFileSync(join(__dirname, '../screens/ShareContainer.tsx'), 'utf8')
      // Comments blanked, for the reason this repository has learned three
      // times: prose describes the intention, not the build.
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    expect(src).toContain('Share.share(');
    expect(src).toMatch(/import \{[^}]*\bShare\b[^}]*\} from 'react-native'/);
  });
});
