/**
 * The live score card iOS shows on the Lock Screen and in the Dynamic Island while a round is being played.
 *
 * The layout below runs in its own small runtime inside iOS, not in the app: it can only use Expo UI
 * (SwiftUI) components, and everything it needs comes in through `props`. Nothing outside the function
 * is available to it, so colours and helpers are declared inside.
 *
 * Only load this file through `@/lib/live-activity` — on builds without the native part (Expo Go, older
 * TestFlight builds) importing it would fail.
 */
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, background, font, foregroundStyle, lineLimit, minimumScaleFactor, monospacedDigit, padding, shapes } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type RoundActivityProps = {
  /** e.g. "Indian Ridge · Match 1" */
  title: string;
  /** Side or team names; empty for games without two sides (stroke play, skins). */
  aName: string;
  bName: string;
  aColor: string;
  bColor: string;
  /** "1 UP", "1 DN", "AS", "WON", "–" */
  aStatus: string;
  bStatus: string;
  /** Who is ahead: 'a', 'b' or '' when level. */
  lead: string;
  /** Which side I'm on: 'a', 'b' or ''. */
  mine: string;
  /** The headline, e.g. "Matt & Dave 1 UP" or "Ben −2 thru 9". */
  big: string;
  /** "thru 6", "Not started", "Final" */
  thru: string;
  done: boolean;
};

function RoundActivity(props: RoundActivityProps, environment: LiveActivityEnvironment) {
  'widget';
  const GOLD = '#C9A227';
  const BG = '#14352A';
  const dim = environment.isLuminanceReduced === true;
  const sides = props.aName !== '' && props.bName !== '';
  const myStatus = props.mine === 'a' ? props.aStatus : props.mine === 'b' ? props.bStatus : props.lead === 'a' ? props.aStatus : props.lead === 'b' ? props.bStatus : props.aStatus;
  const myColor = props.mine === 'a' ? props.aColor : props.mine === 'b' ? props.bColor : props.lead === 'b' ? props.bColor : props.aColor;
  const leadColor = props.lead === 'a' ? props.aColor : props.lead === 'b' ? props.bColor : GOLD;
  const short = (s: string) => (s === '' || s === '–' ? '–' : s);

  // One team's box: filled in its colour when it's ahead.
  const box = (name: string, status: string, color: string, ahead: boolean) => (
    <HStack spacing={6} modifiers={[padding({ horizontal: 10, vertical: 6 }), background(ahead && !dim ? color : '#FFFFFF22', shapes.roundedRectangle({ cornerRadius: 10 }))]}>
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1), minimumScaleFactor(0.7)]}>{name}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 17, weight: 'heavy' }), foregroundStyle(ahead ? '#FFFFFF' : color), monospacedDigit()]}>{short(status)}</Text>
    </HStack>
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 14 }), activityBackgroundTint(BG)]}>
        <HStack spacing={6}>
          <Image systemName="flag.fill" color={GOLD} />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(GOLD), lineLimit(1)]}>{props.title}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#FFFFFFAA')]}>{props.thru}</Text>
        </HStack>
        {sides ? (
          <HStack spacing={8}>
            {box(props.aName, props.aStatus, props.aColor, props.lead === 'a')}
            {box(props.bName, props.bStatus, props.bColor, props.lead === 'b')}
          </HStack>
        ) : null}
        <Text modifiers={[font({ size: 17, weight: 'bold', design: 'serif' }), foregroundStyle('#FFFFFF'), lineLimit(1), minimumScaleFactor(0.7)]}>{props.big}</Text>
      </VStack>
    ),
    compactLeading: (
      <HStack spacing={4}>
        <Image systemName="flag.fill" color={myColor} />
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(myColor), monospacedDigit()]}>{sides ? short(myStatus) : ''}</Text>
      </HStack>
    ),
    compactTrailing: (
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFFCC'), monospacedDigit()]}>{props.done ? 'Final' : props.thru}</Text>
    ),
    minimal: sides ? (
      <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(leadColor), minimumScaleFactor(0.6)]}>{short(myStatus)}</Text>
    ) : (
      <Image systemName="flag.fill" color={GOLD} />
    ),
    expandedLeading: sides ? (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6, top: 6 })]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(props.aColor), lineLimit(1), minimumScaleFactor(0.7)]}>{props.aName}</Text>
        <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(props.lead === 'a' ? '#FFFFFF' : props.aColor), monospacedDigit()]}>{short(props.aStatus)}</Text>
      </VStack>
    ) : (
      <Image systemName="flag.fill" color={GOLD} modifiers={[padding({ leading: 6, top: 6 })]} />
    ),
    expandedTrailing: sides ? (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 6, top: 6 })]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(props.bColor), lineLimit(1), minimumScaleFactor(0.7)]}>{props.bName}</Text>
        <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(props.lead === 'b' ? '#FFFFFF' : props.bColor), monospacedDigit()]}>{short(props.bStatus)}</Text>
      </VStack>
    ) : (
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFFCC'), padding({ trailing: 6, top: 6 })]}>{props.thru}</Text>
    ),
    expandedCenter: (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(GOLD), lineLimit(1), minimumScaleFactor(0.7), padding({ top: 6 })]}>{props.title}</Text>
    ),
    expandedBottom: (
      <HStack modifiers={[padding({ horizontal: 8, bottom: 6 })]}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1), minimumScaleFactor(0.7)]}>{props.big}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13 }), foregroundStyle('#FFFFFFAA')]}>{props.thru}</Text>
      </HStack>
    ),
  };
}

export default createLiveActivity('RoundActivity', RoundActivity);
