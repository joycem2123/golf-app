/** "Show on TV": the event's TV board link, a QR code to open it, and how to get it onto a TV. */
import { useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';

import { QrCode } from '@/components/qr-code';
import { Sheet } from '@/components/round-setup';
import { Body, Button } from '@/components/ui';
import { track } from '@/lib/usage';
import type { EventRecord } from '@/store/store';
import { shareEvent } from '@/sync/sync';
import { space, useColors } from '@/theme';

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
              {/* The share sheet also has Copy, AirDrop and Messages. */}
              <Button small kind="secondary" title="Send or copy link" onPress={() => void Share.share({ message: `${e.name} live scoreboard: ${url}` })} />
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.text, fontWeight: '800' }}>Getting it on the TV</Text>
                <Body muted>• Smart TV: open its web browser and go to the link above.</Body>
                <Body muted>• Laptop on HDMI: open the link and go full screen.</Body>
                <Body muted>• Chromecast / Google TV: open the link in Chrome on a computer, then Cast tab.</Body>
                <Body muted>• Apple TV: open the link on a Mac or iPad and use AirPlay.</Body>
                <Body muted>• Anyone with a phone can point its camera at the QR code to open it.</Body>
              </View>
            </>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
