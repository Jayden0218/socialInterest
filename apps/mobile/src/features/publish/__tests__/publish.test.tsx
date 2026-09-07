import { fireEvent, render, screen } from '@testing-library/react-native';
import type { InterestRef } from '@sih/shared';
import { ComposeScreen, publishDisabledReason } from '../ComposeScreen';
import { VisibilityControl, DEFAULT_VISIBILITY } from '../VisibilityControl';
import { newSlot, type UploadSlot } from '../uploadFlow';
import type { PickedMedia } from '../MediaPickerScreen';

/**
 * These RENDER the real components. Before this, every "screen" returned null
 * and typechecked happily - so a passing typecheck proved nothing about whether
 * anything appeared on screen.
 */
const media: PickedMedia = { uri: 'file://a.jpg', kind: 'image', contentType: 'image/jpeg', sizeBytes: 1024 };
const interest: InterestRef = { interestId: 'i1', name: 'Bouldering', slug: 'bouldering', level: 'top' };
const uploaded = (): UploadSlot => ({ ...newSlot(media), stage: 'uploaded', progress: 1 });

const compose = (over: Partial<React.ComponentProps<typeof ComposeScreen>> = {}) =>
  render(
    <ComposeScreen
      media={[media]}
      slots={[uploaded()]}
      interestOptions={[interest]}
      selectedInterests={[interest]}
      caption=""
      visibility="public"
      publishing={false}
      onCaptionChange={() => undefined}
      onInterestsChange={() => undefined}
      onVisibilityChange={() => undefined}
      onRetry={() => undefined}
      onPublish={() => undefined}
      {...over}
    />,
  );

describe('ComposeScreen renders', () => {
  it('shows the screen with publish enabled when everything is ready', () => {
    compose();
    expect(screen.getByTestId('compose-screen')).toBeTruthy();
    expect(screen.getByTestId('publish-button').props.accessibilityState.disabled).toBe(false);
  });

  it('FR-006: publish is DISABLED with no interest, and says why', () => {
    compose({ selectedInterests: [] });
    expect(screen.getByTestId('publish-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('publish-blocked-reason')).toHaveTextContent(/Choose an interest/);
  });

  it('FR-008: a failed upload offers Retry in place, keeping the picked media', () => {
    const onRetry = jest.fn();
    compose({ slots: [{ ...newSlot(media), stage: 'failed', error: 'network' }], onRetry });
    expect(screen.getByTestId('upload-status-0')).toHaveTextContent(/Failed/);
    fireEvent.press(screen.getByTestId('upload-retry-0'));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ media }));
  });

  it('publish stays blocked while an upload is failed', () => {
    expect(publishDisabledReason([{ ...newSlot(media), stage: 'failed' }], [interest])).toMatch(/Retry/);
  });
});

describe('VisibilityControl renders', () => {
  it('FR-013: public is the default and shows as selected', () => {
    render(<VisibilityControl value={DEFAULT_VISIBILITY} onChange={() => undefined} />);
    expect(screen.getByTestId('visibility-public').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('visibility-private').props.accessibilityState.selected).toBe(false);
  });

  it('shows the CONSEQUENCE of the choice, not just its name', () => {
    render(<VisibilityControl value="followers" onChange={() => undefined} />);
    expect(screen.getByTestId('visibility-control')).toHaveTextContent(/Only people who follow you/);
  });

  it('reports the chosen value', () => {
    const onChange = jest.fn();
    render(<VisibilityControl value="public" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('visibility-private'));
    expect(onChange).toHaveBeenCalledWith('private');
  });
});
