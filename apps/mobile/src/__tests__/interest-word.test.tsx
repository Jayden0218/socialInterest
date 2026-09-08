import { fireEvent, render } from '@testing-library/react-native';
import type { InterestRef } from '@sih/shared';
import { InterestWord } from '../components/InterestWord';

/**
 * 006/FR-014. COLOUR IS REINFORCEMENT, NEVER IDENTIFICATION.
 *
 * The colour comes from a hash, so two unrelated interests can land on similar
 * hues - fine as a cue, fatal as the only cue. A person who cannot distinguish
 * the hues, or who is looking at a greyscale screenshot in a bug report, must
 * still know which interest this is.
 */
const bouldering: InterestRef = {
  interestId: 'INT#bouldering',
  name: 'Bouldering',
  slug: 'bouldering',
  level: 'top',
};

describe('InterestWord (006/US2, 007/FR-024)', () => {
  it('T028 always renders the interest name', () => {
    const t = render(<InterestWord interest={bouldering} />);
    expect(t.getByText('Bouldering')).toBeTruthy();
  });

  it('T028 renders the name for a sub-interest too', () => {
    const ramen: InterestRef = {
      interestId: 'INT#ramen',
      name: 'Ramen',
      slug: 'ramen',
      level: 'sub',
      parent: bouldering,
    };
    const t = render(<InterestWord interest={ramen} />);
    expect(t.getByText('Ramen')).toBeTruthy();
  });

  it('is findable by a stable id built from the slug, not from position', () => {
    const t = render(<InterestWord interest={bouldering} />);
    expect(t.getByTestId('interest-chip-bouldering')).toBeTruthy();
  });

  /**
   * A chip with no handler must not present itself as a button. Announcing
   * "button" for something that does nothing is worse than staying quiet, and
   * contracts/testid-preservation.md rule 6 says so.
   */
  it('is only a button when it actually does something', () => {
    const decorative = render(<InterestWord interest={bouldering} />);
    expect(decorative.queryByRole('button')).toBeNull();

    const onPress = jest.fn();
    const tappable = render(<InterestWord interest={bouldering} onPress={onPress} />);
    fireEvent.press(tappable.getByTestId('interest-chip-bouldering'));
    expect(onPress).toHaveBeenCalledWith('INT#bouldering');
  });
});
