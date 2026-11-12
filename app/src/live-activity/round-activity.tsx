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
  /** 'round': the whole round's team score (and the event's, if it's in one), with each match below. */
  mode?: 'match' | 'round';
  /** Team colours lightened for text on the dark card. */
  aText?: string;
  bText?: string;
  /** Round mode: points so far and projected, as text ("2½"). */
  aTotal?: string;
  bTotal?: string;
  aProj?: string;
  bProj?: string;
  /** Round mode: "EVENT" or "ROUND" (what the totals are). */
  scope?: string;
  /** Round mode: one line per match. */
  lines?: { label: string; text: string; thru: string; color: string }[];
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
  // Team colours lightened for text on the dark card (so a trailing team's score is easy to read).
  const aText = props.aText ?? props.aColor;
  const bText = props.bText ?? props.bColor;

  // ---- The whole round (and the event it's in): totals, projections and every match.
  if (props.mode === 'round') {
    const aLead = props.lead === 'a';
    const bLead = props.lead === 'b';
    const lines = (props.lines ?? []).slice(0, 4);
    const team = (name: string, total: string, proj: string, color: string, text: string, ahead: boolean) => (
      <VStack alignment="leading" spacing={1} modifiers={[padding({ horizontal: 10, vertical: 6 }), background(ahead && !dim ? color : '#FFFFFF1A', shapes.roundedRectangle({ cornerRadius: 10 }))]}>
        <HStack spacing={6}>
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1), minimumScaleFactor(0.7)]}>{name}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 19, weight: 'heavy' }), foregroundStyle(ahead ? '#FFFFFF' : text), monospacedDigit()]}>{total}</Text>
        </HStack>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(ahead ? '#FFFFFFDD' : text), monospacedDigit()]}>proj {proj}</Text>
      </VStack>
    );
    const line = (l: { label: string; text: string; thru: string; color: string }) => (
      <HStack spacing={6}>
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#FFFFFF88')]}>{l.label}</Text>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(l.color), lineLimit(1), minimumScaleFactor(0.7)]}>{l.text}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#FFFFFFAA')]}>{l.thru}</Text>
      </HStack>
    );
    const projColor = aLead ? aText : bLead ? bText : GOLD;
    return {
      banner: (
        <VStack alignment="leading" spacing={7} modifiers={[padding({ all: 14 }), activityBackgroundTint(BG)]}>
          <HStack spacing={6}>
            <Image systemName="flag.fill" color={GOLD} />
            <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(GOLD), lineLimit(1)]}>{props.title}</Text>
            <Spacer />
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#FFFFFF88')]}>{props.scope ?? ''}</Text>
          </HStack>
          <HStack spacing={8}>
            {team(props.aName, props.aTotal ?? '0', props.aProj ?? '0', props.aColor, aText, aLead)}
            {team(props.bName, props.bTotal ?? '0', props.bProj ?? '0', props.bColor, bText, bLead)}
          </HStack>
          {lines.map((l) => line(l))}
        </VStack>
      ),
      compactLeading: (
        <HStack spacing={4}>
          <Image systemName="flag.fill" color={projColor} />
          <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(projColor), monospacedDigit()]}>{`${props.aProj ?? '0'}–${props.bProj ?? '0'}`}</Text>
        </HStack>
      ),
      compactTrailing: <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#FFFFFFAA')]}>{props.done ? 'Final' : 'proj'}</Text>,
      minimal: <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(projColor), minimumScaleFactor(0.5)]}>{props.mine === 'b' ? props.bProj ?? '' : props.aProj ?? ''}</Text>,
      expandedLeading: (
        <VStack alignment="leading" spacing={1} modifiers={[padding({ leading: 6, top: 6 })]}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(aText), lineLimit(1), minimumScaleFactor(0.7)]}>{props.aName}</Text>
          <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(aLead ? '#FFFFFF' : aText), monospacedDigit()]}>{props.aTotal ?? '0'}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(aText)]}>proj {props.aProj ?? '0'}</Text>
        </VStack>
      ),
      expandedTrailing: (
        <VStack alignment="trailing" spacing={1} modifiers={[padding({ trailing: 6, top: 6 })]}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(bText), lineLimit(1), minimumScaleFactor(0.7)]}>{props.bName}</Text>
          <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(bLead ? '#FFFFFF' : bText), monospacedDigit()]}>{props.bTotal ?? '0'}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(bText)]}>proj {props.bProj ?? '0'}</Text>
        </VStack>
      ),
      expandedCenter: <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(GOLD), lineLimit(1), minimumScaleFactor(0.7), padding({ top: 6 })]}>{props.title}</Text>,
      expandedBottom: (
        <VStack alignment="leading" spacing={3} modifiers={[padding({ horizontal: 8, bottom: 6 })]}>
          {lines.slice(0, 3).map((l) => line(l))}
        </VStack>
      ),
    };
  }

  // One team's box: filled in its colour when it's ahead.
  const box = (name: string, status: string, color: string, ahead: boolean, text: string) => (
    <HStack spacing={6} modifiers={[padding({ horizontal: 10, vertical: 6 }), background(ahead && !dim ? color : '#FFFFFF22', shapes.roundedRectangle({ cornerRadius: 10 }))]}>
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1), minimumScaleFactor(0.7)]}>{name}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 17, weight: 'heavy' }), foregroundStyle(ahead ? '#FFFFFF' : text), monospacedDigit()]}>{short(status)}</Text>
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
            {box(props.aName, props.aStatus, props.aColor, props.lead === 'a', aText)}
            {box(props.bName, props.bStatus, props.bColor, props.lead === 'b', bText)}
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
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(aText), lineLimit(1), minimumScaleFactor(0.7)]}>{props.aName}</Text>
        <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(props.lead === 'a' ? '#FFFFFF' : aText), monospacedDigit()]}>{short(props.aStatus)}</Text>
      </VStack>
    ) : (
      <Image systemName="flag.fill" color={GOLD} modifiers={[padding({ leading: 6, top: 6 })]} />
    ),
    expandedTrailing: sides ? (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 6, top: 6 })]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(bText), lineLimit(1), minimumScaleFactor(0.7)]}>{props.bName}</Text>
        <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(props.lead === 'b' ? '#FFFFFF' : bText), monospacedDigit()]}>{short(props.bStatus)}</Text>
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
