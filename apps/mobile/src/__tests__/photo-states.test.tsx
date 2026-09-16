import { fireEvent, render } from '@testing-library/react-native';
import { Photo } from '../ui/Photo';

/**
 * 012/FR-006a. A PHOTOGRAPH HAS FOUR STATES AND THEY MUST NOT BE ONE RECTANGLE.
 *
 * Research R3, on the feed capture: "six cards, six empty grey boxes, on a
 * product whose entire premise is photographs". Two causes, deliberately not
 * conflated — object storage really was unreachable where that capture ran, AND
 * the app drew the same thing whether an image was arriving, arrived, or
 * refused. The second is a product gap on any network.
 *
 * WHAT RNTL CAN AND CANNOT ANSWER HERE, because 008 paid for confusing them:
 * it performs NO LAYOUT, so "the placeholder covers the frame" is not testable
 * in this file and is measured in a browser instead. What IS testable is which
 * elements exist in which state, and that is the half R3 is about: a failure
 * and a wait must be different nodes, not the same grey box twice.
 */
describe('a photograph carries its own states', () => {
  it('shows a placeholder until the image loads, and not after', () => {
    const r = render(<Photo testID="p" uri="https://example.test/a.jpg" />);
    // The image is mounted from the first render — the skeleton is drawn OVER
    // it rather than instead of it, because swapping would remount the Image
    // and restart the fetch. So BOTH are present while it loads.
    expect(r.queryByTestId('p-loading')).not.toBeNull();
    expect(r.queryByTestId('p')).not.toBeNull();
    expect(r.queryByTestId('p-failed')).toBeNull();

    fireEvent(r.getByTestId('p'), 'load');
    expect(r.queryByTestId('p-loading')).toBeNull();
    expect(r.queryByTestId('p-failed')).toBeNull();
    expect(r.queryByTestId('p')).not.toBeNull();
  });

  it('a refused image is a DIFFERENT state from one still arriving, and offers a retry', () => {
    const r = render(<Photo testID="p" uri="https://example.test/a.jpg" />);
    fireEvent(r.getByTestId('p'), 'error');

    expect(r.queryByTestId('p-failed')).not.toBeNull();
    expect(r.queryByTestId('p-retry')).not.toBeNull();
    // And it is not the loading state either: three states, three answers.
    expect(r.queryByTestId('p-loading')).toBeNull();
    // And the image is gone, so the two cannot be on screen together saying
    // different things.
    expect(r.queryByTestId('p')).toBeNull();
  });

  /**
   * VERIFIED BY BREAKING IT would be hard to state here, so this states the
   * mechanism instead: retrying must produce a NEW `Image`, because React
   * Native caches by uri and re-rendering the same element after an error does
   * not re-request. The key carries an attempt counter; a retry that changed
   * only the state would look like a working button and fetch nothing.
   */
  it('a retry puts the image back and tries again', () => {
    const r = render(<Photo testID="p" uri="https://example.test/a.jpg" />);
    fireEvent(r.getByTestId('p'), 'error');
    fireEvent.press(r.getByTestId('p-retry'));

    expect(r.queryByTestId('p-failed')).toBeNull();
    expect(r.queryByTestId('p')).not.toBeNull();
  });

  it('no image at all is its own state, distinct from a failure', () => {
    const r = render(<Photo testID="p" uri={null} absent="No photo" />);
    expect(r.queryByTestId('p-absent')).not.toBeNull();
    expect(r.queryByTestId('p-failed')).toBeNull();
    expect(r.queryByTestId('p')).toBeNull();
  });

  /**
   * A RECYCLED ROW MUST NOT INHERIT THE PREVIOUS ROW'S FAILURE.
   *
   * A list reuses component instances. Without resetting on a changed `uri`,
   * scrolling past one image that failed shows "this photo would not load" over
   * the next photograph, which loads perfectly well.
   */
  it('forgets a failure when it is given a different photograph', () => {
    const r = render(<Photo testID="p" uri="https://example.test/a.jpg" />);
    fireEvent(r.getByTestId('p'), 'error');
    expect(r.queryByTestId('p-failed')).not.toBeNull();

    r.rerender(<Photo testID="p" uri="https://example.test/b.jpg" />);
    expect(r.queryByTestId('p-failed')).toBeNull();
    expect(r.queryByTestId('p')).not.toBeNull();
  });
});
