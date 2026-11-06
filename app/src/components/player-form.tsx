import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Label, Segmented, styles } from '@/components/ui';
import { formatIndex, parseIndex } from '@/lib/format';
import { newId, type SavedPlayer } from '@/store/store';

/** Split "Mike van Dyke" into first "Mike" and last "van Dyke". */
export function splitName(p?: Pick<SavedPlayer, 'name' | 'firstName' | 'lastName'>): { first: string; last: string } {
  if (!p) return { first: '', last: '' };
  if (p.firstName || p.lastName) return { first: p.firstName ?? '', last: p.lastName ?? '' };
  const [first, ...rest] = p.name.trim().split(/\s+/);
  return { first: first ?? '', last: rest.join(' ') };
}

/**
 * Add or edit a player. `fullName` asks for first and last name separately (required for "Me").
 */
export function PlayerForm({
  initial,
  onSave,
  onCancel,
  fullName,
}: {
  initial?: SavedPlayer;
  onSave: (p: SavedPlayer) => void;
  onCancel?: () => void;
  fullName?: boolean;
}) {
  const start = splitName(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [first, setFirst] = useState(start.first);
  const [last, setLast] = useState(start.last);
  const [index, setIndex] = useState(initial ? formatIndex(initial.handicapIndex) : '');
  const [gender, setGender] = useState<'M' | 'F'>(initial?.gender ?? 'M');
  const parsed = parseIndex(index);
  const nameOk = fullName ? first.trim().length > 0 && last.trim().length > 0 : name.trim().length > 0;
  const valid = nameOk && parsed !== null;

  const save = () => {
    const base = { ...(initial ?? {}), id: initial?.id || newId(), handicapIndex: parsed!, gender };
    onSave(
      fullName
        ? { ...base, firstName: first.trim(), lastName: last.trim(), name: `${first.trim()} ${last.trim()}` }
        : { ...base, name: name.trim() },
    );
  };

  return (
    <Card>
      {fullName ? (
        <View style={styles.row}>
          <Field label="First name" value={first} onChangeText={setFirst} placeholder="Joyce" autoCapitalize="words" autoComplete="given-name" />
          <Field label="Last name" value={last} onChangeText={setLast} placeholder="Smith" autoCapitalize="words" autoComplete="family-name" />
        </View>
      ) : null}
      <View style={styles.row}>
        {!fullName && <Field label="Name" value={name} onChangeText={setName} placeholder="Mike" autoCapitalize="words" />}
        <View style={{ width: fullName ? undefined : 110, flex: fullName ? 1 : undefined }}>
          <Field label="Handicap index" value={index} onChangeText={setIndex} placeholder="12.4 or +1.2" keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Segmented options={[{ value: 'M', label: "Men's tees" }, { value: 'F', label: "Women's tees" }]} value={gender} onChange={setGender} />
      {index.length > 0 && parsed === null ? <Label style={{ textTransform: 'none' }}>Enter an index like 12.4, or +1.2 for a plus handicap</Label> : null}
      {fullName && !nameOk ? <Label style={{ textTransform: 'none' }}>First and last name are both required.</Label> : null}
      <View style={styles.row}>
        {onCancel ? <View style={{ flex: 1 }}><Button title="Cancel" kind="ghost" onPress={onCancel} /></View> : null}
        <View style={{ flex: 1 }}>
          <Button title={initial ? 'Save' : 'Add player'} disabled={!valid} onPress={save} />
        </View>
      </View>
    </Card>
  );
}
