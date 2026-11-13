/** "Show on TV": the event's TV board link, a QR code to open it, and how to get it onto a TV. */
import { useState } from 'react';
import { ActivityIndicator, Platform, Share, Text, View } from 'react-native';

import { QrCode } from '@/components/qr-code';
import { Sheet } from '@/components/round-setup';
import { Body, Button } from '@/components/ui';
import { track } from '@/lib/usage';
import type { EventRecord } from '@/store/store';
import { shareEvent } from '@/sync/sync';
import { fonts, radius, space, useColors } from '@/theme';

export const tvUrl = (code: string) => `https://clutchupgolf.com/tv/board/?c=${code}`;

export function TvButton({ e }: { e: EventRecord }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(e.remote?.shareCode ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setOpen(true);
    setErr(null);
    track('tv_board_opened');
    if (code) return;
    // The board reads the event by its share code, so put it online first if it isn't.
    setBusy(true);
    try {
      setCode(await shareEvent(e.id));
    } catch {
      setErr('Couldn’t put the event online. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const url = code ? tvUrl(code) : '';

  return (
    <>
      <Button title="📺 Show on TV" kind="secondary" onPress={() => void start()} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Show on TV">
        <View style={{ gap: space.md }}>
          <Body muted>A live scoreboard for a TV or big screen. It updates itself as scores come in.</Body>
          {busy && <ActivityIndicator color={c.primary} />}
          {err && <Text style={{ color: c.danger }}>{err}</Text>}
          {code ? (
            <>
              <View style={{ alignItems: 'center', gap: space.sm }}>
                <QrCode value={url} size={200} color="#14261E" />
                <Text selectable style={{ color: c.primary, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>{url.replace('https://', '')}</Text>
              </View>
              {/* Easiest on another device: no link to copy, just a short address and the code. */}
              <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.lg, padding: space.md, alignItems: 'center', gap: 4 }}>
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>ON THE TV OR COMPUTER, GO TO</Text>
                <Text selectable style={{ color: c.primary, fontSize: 22, fontWeight: '800' }}>clutchupgolf.com/tv</Text>
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 4 }}>AND ENTER THE CODE</Text>
                <Text selectable style={{ color: c.text, fontFamily: fonts.serif, fontSize: 34, fontWeight: '700', letterSpacing: 6 }}>{code}</Text>
              </View>
              {/* Just the link, nothing else, so it pastes cleanly. The share sheet has Copy, AirDrop, Messages and Mail. */}
              <Button small kind="secondary" title="Share or copy the link" onPress={() => void Share.share(Platform.OS === 'ios' ? { url } : { message: url })} />
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.text, fontWeight: '800' }}>Other ways</Text>
                <Body muted>• AirDrop the link to a Mac, then AirPlay or HDMI it to the TV.</Body>
                <Body muted>• Email or text the link to yourself and open it on the computer.</Body>
                <Body muted>• Chromecast / Google TV: open it in Chrome on a computer, then Cast tab.</Body>
                <Body muted>• Phones can scan the QR code to follow along.</Body>
              </View>
            </>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
