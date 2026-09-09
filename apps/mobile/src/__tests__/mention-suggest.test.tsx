import { completeMention, trailingMention } from '../components/MentionSuggest';

/**
 * 008/US9. The two rules the autocomplete rests on, tested without a renderer.
 */
describe('008/US9 completing a mention while typing', () => {
  it('offers only for a handle being typed at the END', () => {
    expect(trailingMention('morning @ad')).toBe('ad');
    // Mid-text: the person has moved past it, and replacing behind the cursor
    // is worse than suggesting nothing.
    expect(trailingMention('morning @ada and more')).toBeNull();
    expect(trailingMention('no handles here')).toBeNull();
    expect(trailingMention('ada@example.te')).toBeNull();
  });

  it('replaces the partial and leaves a space to keep typing', () => {
    expect(completeMention('morning @ad', 'ada')).toBe('morning @ada ');
  });

  it('touches nothing else in the text', () => {
    expect(completeMention('see @ada and @j', 'jo')).toBe('see @ada and @jo ');
  });
});
