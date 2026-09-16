import { Modal, Pressable, Text, View } from 'react-native';
import { activePalette as palette, MIN_TOUCH_TARGET, radius, space, textStyle } from './theme';
import { Icon } from './Icon';
import type { IconName } from './icons';

/**
 * 012/T034. A BOTTOM SHEET OF LABELLED ACTIONS — `PostActions.dc.html`.
 *
 * The artboards draw one for a post and one for a person: a dimmed backdrop, a
 * grab handle, a caption naming what the actions are ABOUT, then a row per
 * action with an icon and a word.
 *
 * WHY IT IS A SHEET AND NOT MORE BUTTONS. The alternative this replaces is a
 * row of secondary buttons on the screen itself, which is where post detail put
 * Report — so the number of actions a post can have was bounded by the width of
 * a phone, and "Not interested" and "Mute" never fitted. Constitution IV says
 * safety ships with the product and is a release gate: a sheet is what makes
 * report, mute and dismiss all reachable in one tap from the same place, rather
 * than one of them being reachable and the rest being somewhere else.
 *
 * EVERY ROW IS LABELLED. The task's own framing — "report and block sit behind
 * an unlabelled ⋯" — is the thing to avoid, so the control that OPENS this
 * carries an accessible name and every row inside it is an icon AND a word.
 * Constitution IV: easier to reach, never harder.
 *
 * A REAL `Modal`, not an absolutely-positioned View. It takes the back gesture
 * and the hardware back button on Android for dismissal, which is the one place
 * a gesture is the right answer — it is an ADDITIONAL way out, and `sheet-close`
 * is the visible one FR-018 asks for.
 */
/**
 * THE CLOSED SET OF ROWS, DECLARED HERE, and that is what makes the testIDs
 * checkable.
 *
 * `verify-maestro-ids` reads a dynamic prefix off the leading literal of a
 * template in a `testID=` position and then resolves the SUFFIX against string
 * literals in the file that builds the prefix. `sheet-${action.key}` with a
 * `key: string` put the prefix here and the suffixes in the callers, so it
 * refused `sheet-mute` and `sheet-dismiss` — correctly, and with the message
 * 005 got three times: "this is how pref-message passed while the switch did
 * not exist."
 *
 * Declaring the union here puts every suffix in this file, which the verifier
 * reads. It is also the better design: a sheet row's id is part of the app's
 * contract with its own flows, so the set of them is worth being closed rather
 * than whatever a caller happened to type.
 */
export type SheetActionKey =
  | 'share'
  | 'save'
  | 'dismiss'
  | 'mute'
  | 'report'
  | 'message'
  | 'block';

export interface SheetAction {
  key: SheetActionKey;
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Drawn in the danger colour. For destructive or irreversible actions. */
  destructive?: boolean;
}

export function ActionSheet({
  visible,
  caption,
  actions,
  onClose,
  testID,
}: {
  visible: boolean;
  /** What these actions are about: "This post", or a handle. */
  caption: string;
  actions: SheetAction[];
  onClose: () => void;
  testID: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/*
        The backdrop is a control, because tapping outside a sheet to dismiss it
        is what everybody expects — and because a modal with one way out that is
        below the fold is how 006 lost a safety control.
      */}
      <Pressable
        testID={`${testID}-backdrop`}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        // `minHeight` beside the `flex`, because the touch-target guard reads
        // the style and `flex: 1` is not a size it can check: a flexed child of
        // a small container is small. This one fills a full-screen Modal, so
        // the floor is true rather than decorative.
        style={{
          flex: 1,
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: palette.bg.scrim,
          justifyContent: 'flex-end',
        }}
      >
        {/*
          Stops a tap on the sheet itself from closing it. `onStartShouldSetResponder`
          rather than an inner Pressable: a Pressable wrapping the rows would put
          two tap targets on every one of them, which is the stacked-target
          problem the cold start already avoids.
        */}
        <View
          testID={testID}
          onStartShouldSetResponder={() => true}
          style={{
            backgroundColor: palette.bg.raised,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingTop: space.sm,
            paddingHorizontal: space.lg,
            paddingBottom: space.xl,
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 38,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: palette.line.strong,
              alignSelf: 'center',
              marginBottom: space.sm,
            }}
          />
          <Text style={{ ...textStyle.caption, color: palette.text.muted, paddingBottom: 4 }}>
            {caption}
          </Text>

          {actions.map((action) => (
            <Pressable
              key={action.key}
              testID={`sheet-${action.key}`}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                // Closed BEFORE the action runs, so a row that navigates does
                // not leave a sheet floating over the screen it opened.
                onClose();
                action.onPress();
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 15,
                minHeight: MIN_TOUCH_TARGET,
              }}
            >
              <Icon
                name={action.icon}
                size="action"
                color={action.destructive ? palette.intent.danger : palette.text.primary}
              />
              <Text
                style={{
                  ...textStyle.body,
                  color: action.destructive ? palette.intent.danger : palette.text.primary,
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}

          {/*
            012/FR-018. A VISIBLE way out, not only the backdrop and the
            platform's back. The requirement is about a control, and a backdrop
            is not one a person can see.
          */}
          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingVertical: 15,
              minHeight: MIN_TOUCH_TARGET,
            }}
          >
            <Icon name="close" size="action" color={palette.text.muted} />
            <Text style={{ ...textStyle.body, color: palette.text.muted }}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
