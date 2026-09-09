import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ScreenHeader } from '../ui/primitives';

/**
 * 007, run 46 — A SCREEN TITLE NEVER WRAPS.
 *
 * The emulator capture shows the Chats header rendered as "Chat" / "s" across
 * two lines. The same screen measured in a browser at the same 320pt width puts
 * it on ONE line, 53.6pt wide, with 158pt of slack — so no browser run could
 * ever have found it. react-native-web does not use the platform's font
 * metrics, which is the same reason 006's overflowing Avatar initial was
 * invisible there.
 *
 * So the guard is here rather than in `apps/e2e`: it asserts the PROP that
 * makes wrapping impossible, which is checkable without a device. A heading
 * that cannot fit should ellipsize, never reflow the header and push the
 * screen's content down.
 */
describe('a screen title is one line', () => {
  it('ScreenHeader renders its title with numberOfLines={1}', () => {
    const { getByText } = render(<ScreenHeader title="Chats" />);
    expect(getByText('Chats').props.numberOfLines).toBe(1);
  });

  it('and still does so when the header carries a right-hand control', () => {
    const { getByText } = render(<ScreenHeader title="Chats" right={<Text>+</Text>} />);
    expect(getByText('Chats').props.numberOfLines).toBe(1);
  });
});
