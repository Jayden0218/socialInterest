/**
 * Shared by every container in this directory.
 *
 * `Failed` is used by 18 of the 26 containers, so it lives here rather than
 * being duplicated or re-exported through one of them.
 */
import { Text, View } from 'react-native';
import { activePalette as palette, space } from '../ui/theme';

/**
 * Containers: they fetch, the screens render.
 *
 * The screens stay presentational and prop-driven. That is what keeps the 31
 * render tests free of a network, and what lets apps/e2e exercise the same data
 * modules in Node without React. The wiring lives here and nowhere else.
 *
 * A failed load renders its own error, never an empty list - showing "nothing
 * here yet" for a dropped connection is the mistake this shape prevents.
 */
export function Failed({ message }: { message: string }) {
  return (
    <View testID="load-error" style={{ padding: space.md }}>
      <Text style={{ color: palette.intent.danger }}>{message}</Text>
    </View>
  );
}
