/** A QR code drawn with plain views (works on the web and in the app, no image needed). */
import makeQr from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

export function QrCode({ value, size, color = '#000000', background = '#FFFFFF' }: { value: string; size: number; color?: string; background?: string }) {
  const grid = useMemo(() => {
    const qr = makeQr(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  }, [value]);
  const quiet = 2; // white margin, in modules
  const cell = Math.max(1, Math.floor(size / (grid.length + quiet * 2)));
  return (
    <View accessibilityLabel={`QR code for ${value}`} style={{ backgroundColor: background, padding: cell * quiet, alignSelf: 'flex-start' }}>
      {grid.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((dark, c) => <View key={c} style={{ width: cell, height: cell, backgroundColor: dark ? color : background }} />)}
        </View>
      ))}
    </View>
  );
}
