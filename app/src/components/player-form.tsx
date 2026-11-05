import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Label, Segmented, styles } from '@/components/ui';
import { formatIndex, parseIndex } from '@/lib/format';
import { newId, type SavedPlayer } from '@/store/store';

export function PlayerForm({ initial, onSave, onCancel }: { initial?: SavedPlayer; onSave: (p: SavedPlayer) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [index, setIndex] = useState(initial ? formatIndex(initial.handicapIndex) : '');
  const [gender, setGender] = useState<'M' | 'F'>(initial?.gender ?? 'M');
  const parsed = parseIndex(index);
  const valid = name.trim().length > 0 && parsed !== null;
  return (
    <Card>
      <View style={styles.row}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Mike" autoCapitalize="words" />
        <View style={{ width: 110 }}>
          <Field label="Handicap index" value={index} onChangeText={setIndex} placeholder="12.4 or +1.2" keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Segmented options={[{ value: 'M', label: "Men's tees" }, { value: 'F', label: "Women's tees" }]} value={gender} onChange={setGender} />
      {index.length > 0 && parsed === null ? <Label style={{ textTransform: 'none' }}>Enter an index like 12.4, or +1.2 for a plus handicap</Label> : null}
      <View style={styles.row}>
        {onCancel ? <View style={{ flex: 1 }}><Button title="Cancel" kind="ghost" onPress={onCancel} /></View> : null}
        <View style={{ flex: 1 }}>
          <Button
            title={initial ? 'Save' : 'Add player'}
            disabled={!valid}
            onPress={() => onSave({ id: initial?.id ?? newId(), name: name.trim(), handicapIndex: parsed!, gender })}
          />
        </View>
      </View>
    </Card>
  );
}
