import { fireEvent, render } from '@testing-library/react-native';
import { MentionText, splitMentions } from '../components/MentionText';
import { textStyle } from '../ui/theme';

/**
 * 008/US9. The client half of mentions.
 *
 * `splitMentions` is asserted to LOSE NO CHARACTERS, because the failure mode
 * of a text splitter is silently eating part of what somebody wrote — and a
 * caption is the one thing on the card that is theirs.
 */
describe('008/US9 mentions in text', () => {
  it('keeps the whole string, in order', () => {
    const text = 'morning @ada, ask @jo — thanks!';
    expect(splitMentions(text).map((p) => p.text).join('')).toBe(text);
  });

  it('marks only the handle spans', () => {
    expect(splitMentions('hi @ada!').map((p) => p.handle)).toEqual([null, 'ada', null]);
  });

  it('does not treat an email address as a mention', () => {
    // The same rule the server parses by. Two parsers, one behaviour, asserted
    // on both sides rather than assumed to agree.
    expect(splitMentions('write to ada@example.test').map((p) => p.handle)).toEqual([null]);
  });

  it('opens the person whose handle the READER can see', () => {
    const opened: string[] = [];
    const t = render(
      <MentionText
        text="thanks @ada"
        style={textStyle.body}
        onOpenPerson={(h) => opened.push(h)}
      />,
    );
    fireEvent.press(t.getByTestId('mention-ada'));
    expect(opened).toEqual(['ada']);
  });

  it('renders plain text where nothing can navigate', () => {
    const t = render(<MentionText text="thanks @ada" style={textStyle.body} />);
    expect(t.queryByTestId('mention-ada')).toBeNull();
  });
});
