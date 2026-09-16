import { fireEvent, render } from '@testing-library/react-native';
import type { InterestRef } from '@sih/shared';
import { InterestSelector } from '../InterestSelector';

/**
 * 013/T021, FR-009, FR-010. A NEAR-DUPLICATE REFUSAL IS A CHOICE.
 *
 * The server returns the interests a typed name resembles so the person can
 * join one instead of creating a near-duplicate. Showing only the error message
 * would make the whole sprawl control invisible: the API refuses correctly, and
 * the person is told "too similar" with nothing to do about it — which leaves
 * them retyping variants until one is accepted, the exact opposite of the
 * intent.
 *
 * This is the half that shipped missing. The 409 carried the candidates and the
 * screen dropped them on the floor; the run record named it as the outstanding
 * user-facing gap before this test existed.
 */
const ref = (interestId: string, name: string): InterestRef => ({
  interestId,
  name,
  slug: name.toLowerCase(),
});

describe('013/FR-009 — the compose screen offers what already exists', () => {
  it('shows the candidates a refused publish returned', () => {
    const t = render(
      <InterestSelector
        selected={[]}
        options={[]}
        onChange={() => undefined}
        typedName="bouldring"
        onTypedNameChange={() => undefined}
        candidates={[ref('i1', 'Bouldering'), ref('i2', 'Boulders')]}
        onJoinExisting={() => undefined}
      />,
    );

    expect(t.getByTestId('duplicate-candidates')).toBeTruthy();
    expect(t.getByText('Bouldering')).toBeTruthy();
    expect(t.getByText('Boulders')).toBeTruthy();
  });

  it('joining one is a single tap, and reports WHICH one', () => {
    const joined: InterestRef[] = [];
    const t = render(
      <InterestSelector
        selected={[]}
        options={[]}
        onChange={() => undefined}
        typedName="bouldring"
        onTypedNameChange={() => undefined}
        candidates={[ref('i1', 'Bouldering'), ref('i2', 'Boulders')]}
        onJoinExisting={(r) => joined.push(r)}
      />,
    );

    fireEvent.press(t.getByTestId('join-existing-i2'));

    // The SECOND one, not merely "something was pressed". A handler wired to
    // the wrong row is the defect a count-only assertion passes over.
    expect(joined.map((r) => r.interestId)).toEqual(['i2']);
  });

  it('offers nothing when there is nothing to offer', () => {
    const t = render(
      <InterestSelector
        selected={[]}
        options={[]}
        onChange={() => undefined}
        typedName="bouldering"
        onTypedNameChange={() => undefined}
        candidates={[]}
        onJoinExisting={() => undefined}
      />,
    );

    expect(t.queryByTestId('duplicate-candidates')).toBeNull();
  });
});
