import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { PlayerForm } from '@/components/player-form';
import { Body, Button, Card, H2, styles } from '@/components/ui';
import { formatIndex } from '@/lib/format';
import { useStore } from '@/store/store';
import { space } from '@/theme';

export default function Players() {
  const players = useStore((s) => s.players);
  const upsert = useStore((s) => s.upsertPlayer);
  const remove = useStore((s) => s.removePlayer);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Body muted>Your regular group. Update a player’s handicap index here whenever it changes on Golf Canada.</Body>
      {players.map((p) =>
        editing === p.id ? (
          <PlayerForm key={p.id} initial={p} onCancel={() => setEditing(null)} onSave={(x) => { upsert(x); setEditing(null); }} />
        ) : (
          <Card key={p.id}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <View>
                <H2>{p.name}</H2>
                <Body muted>Index {formatIndex(p.handicapIndex)} · {p.gender === 'F' ? "Women's" : "Men's"} tees</Body>
              </View>
              <View style={styles.row}>
                <Button small kind="secondary" title="Edit" onPress={() => setEditing(p.id)} />
                <Button
                  small
                  kind="ghost"
                  title="Remove"
                  onPress={() => Alert.alert(`Remove ${p.name}?`, 'Past rounds are kept.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove(p.id) }])}
                />
              </View>
            </View>
          </Card>
        ),
      )}
      {adding ? (
        <PlayerForm onCancel={() => setAdding(false)} onSave={(x) => { upsert(x); setAdding(false); }} />
      ) : (
        <Button title="Add a player" kind="secondary" onPress={() => setAdding(true)} />
      )}
    </ScrollView>
  );
}
