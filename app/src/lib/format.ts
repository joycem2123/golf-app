/** Golfers write plus handicaps as "+1.2"; the engine stores them as -1.2. */
export function formatIndex(i: number): string {
  if (i < 0) return `+${Math.abs(i).toFixed(1)}`;
  return i.toFixed(1);
}

export function parseIndex(s: string): number | null {
  const t = s.trim();
  if (!/^\+?\d{1,2}(\.\d)?$/.test(t)) return null;
  const n = parseFloat(t.replace('+', ''));
  if (n > 54) return null;
  return t.startsWith('+') ? -n : n;
}

export function toPar(n: number): string {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;
}
