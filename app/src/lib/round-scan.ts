/**
 * "Upload scorecard": read players' scores from a photo of a finished card, then set the round up as usual
 * and go straight to the results.
 */
import type { ScoreLedger } from '@golf/engine';

import { ensureSession } from '@/sync/auth';
import { needsProError, openPaywall } from '@/lib/pro';
import { supabase } from '@/sync/supabase';
import { track } from './usage';

export interface ScannedRow {
  name: string;
  /** Index 0 = hole 1. */
  scores: (number | null)[];
  /** Holes that were hard to read (1-18). */
  unsure: number[];
  /** The saved player (me or a friend) this row was confirmed as; null = "not them". */
  playerId?: string | null;
  /** No match: an existing friend, or someone new (needs a handicap index). */
  who?: 'friend' | 'new';
  /** Someone new: handicap index as typed, and which tees (men's or women's) they play. */
  newIndex?: string;
  newGender?: 'M' | 'F';
  /** A different tee from the group's (tee id). */
  teeId?: string;
}

export interface ScannedRound {
  courseName: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  rows: ScannedRow[];
  notes: string;
  /** Chosen on the score-check screen. */
  courseId?: string;
  /** Tee name everyone played (each player gets their men's/women's version of it). */
  teeName?: string;
  /** Who played, from which tee: filled in when moving on to the round setup. */
  roster?: { id: string; teeId: string }[];
}

// The card being uploaded, between the review screen and New Round (not saved to the phone).
let pending: ScannedRound | null = null;
export const setPendingScan = (s: ScannedRound | null) => (pending = s);
export const getPendingScan = () => pending;

/** Send the photo to be read. */
export async function readRoundPhoto(base64: string, into?: { roundId?: string; eventId?: string }): Promise<ScannedRound> {
  await ensureSession();
  // Which round/event it's for, so the organiser's Pro covers it.
  const { data, error } = await supabase.functions.invoke('read-round', { body: { image: base64, mediaType: 'image/jpeg', ...into } });
  if (error && needsProError(error, data)) {
    openPaywall('scorecard');
    throw new Error('Scorecard uploads are part of Clutch Up Pro.');
  }
  if (error) {
    let msg = 'Couldn’t read the scorecard. Check your connection and try again.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) msg = body.error;
    } catch {
      /* keep the general message */
    }
    track('scorecard_uploaded_read', { ok: false });
    throw new Error(msg);
  }
  const card = data?.card as ScannedRound | undefined;
  const rows = (card?.rows ?? []).filter((r) => r.scores.some((s) => s !== null));
  track('scorecard_uploaded_read', { ok: rows.length > 0, rows: rows.length });
  if (!rows.length) throw new Error('No scores could be read from that photo. Try a clearer, straight-on photo of the whole card.');
  return { courseName: card?.courseName ?? null, date: card?.date ?? null, rows, notes: card?.notes ?? '' };
}

/** Holes with at least one score on the card. */
export const holesOnCard = (s: ScannedRound) => Array.from({ length: 18 }, (_, i) => i + 1).filter((h) => s.rows.some((r) => r.scores[h - 1] !== null));

/** 9 holes from 1 or 10 when only one nine has scores; otherwise 18 from hole 1. */
export function holesFromCard(s: ScannedRound): { holes: 9 | 18; start: number } {
  const h = holesOnCard(s);
  if (h.length && h.every((n) => n <= 9)) return { holes: 9, start: 1 };
  if (h.length && h.every((n) => n >= 10)) return { holes: 9, start: 10 };
  return { holes: 18, start: 1 };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9& ]/g, '').trim();

/** How well a scorecard name matches a player's name (higher is better, 0 = no match). */
export function nameScore(written: string, label: string): number {
  const w = norm(written);
  const l = norm(label);
  if (!w || !l) return 0;
  if (w === l) return 100;
  const [wf, ...wr] = w.split(/\s+/);
  const [lf, ...lr] = l.split(/\s+/);
  if (wf === lf) return 80 + (wr[0] && lr[0] && lr[0].startsWith(wr[0][0]) ? 10 : 0);
  if (lf.startsWith(wf) || wf.startsWith(lf)) return 60;
  const initials = l.split(/\s+/).map((x) => x[0]).join('');
  if (w.replace(/\s+/g, '') === initials) return 50;
  if (l.includes(wf) || w.includes(lf)) return 30;
  return 0;
}

/** The saved person (me or a friend) a card name most likely is, skipping anyone already taken by another row. */
export function suggestPlayer<P extends { id: string; name: string }>(written: string, people: P[], taken: string[] = []): P | null {
  let best: P | null = null;
  let bestScore = 0;
  for (const p of people) {
    if (taken.includes(p.id)) continue;
    const s = nameScore(written, p.name);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return bestScore >= 50 ? best : null;
}

/** Best guess at which card row belongs to each player/team (each row used once; null = no guess). */
export function guessRows(keys: { key: string; label: string }[], rows: ScannedRow[]): Record<string, number | null> {
  // Rows already confirmed as a player belong to that player.
  const confirmed = new Map(rows.map((r, i) => [r.playerId, i] as const).filter(([id]) => !!id));
  const pairs = keys.flatMap((k) => rows.map((r, i) => ({ k: k.key, i, s: nameScore(r.name, k.label) }))).filter((p) => p.s > 0);
  pairs.sort((a, b) => b.s - a.s);
  const out: Record<string, number | null> = Object.fromEntries(keys.map((k) => [k.key, confirmed.get(k.key) ?? null]));
  const used = new Set<number>(Object.values(out).filter((i): i is number => i !== null));
  for (const p of pairs) {
    if (out[p.k] !== null || used.has(p.i)) continue;
    out[p.k] = p.i;
    used.add(p.i);
  }
  // Same number of rows as players and only one left over: give it to the one left.
  const freeKeys = keys.filter((k) => out[k.key] === null);
  const freeRows = rows.map((_, i) => i).filter((i) => !used.has(i));
  if (freeKeys.length === 1 && freeRows.length === 1) out[freeKeys[0].key] = freeRows[0];
  return out;
}

/** Scores for the round, from the chosen card row for each player/team. */
export function ledgerFromCard(map: Record<string, number | null>, rows: ScannedRow[], enteredBy: string, holes: number[]): ScoreLedger {
  const ledger: ScoreLedger = {};
  const at = Date.now();
  for (const [key, i] of Object.entries(map)) {
    if (i === null || !rows[i]) continue;
    for (const h of holes) {
      const gross = rows[i].scores[h - 1];
      if (gross == null) continue;
      ledger[`${key}#${h}`] = { key, hole: h, gross, enteredBy, enteredAt: at };
    }
  }
  return ledger;
}

/** A sensible round time for the date on the card (noon that day); now if missing, invalid or in the future. */
export function playedAt(date: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return Date.now();
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
  return Number.isFinite(t) && t <= Date.now() && t > Date.now() - 5 * 365 * 86_400_000 ? t : Date.now();
}
