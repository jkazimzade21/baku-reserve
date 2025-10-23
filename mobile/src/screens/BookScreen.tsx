import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { fetchAvailability } from '../api';

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function timeFromISO(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

export default function BookScreen({ route, navigation }: any) {
  const { id, name } = route.params;
  const [dateStr, setDateStr] = useState<string>(todayStr());
  const [partySize, setPartySize] = useState<string>('2');
  const [loading, setLoading] = useState<boolean>(false);
  const [slots, setSlots] = useState<any[]>([]);

  async function load() {
    try {
      setLoading(true);
      const ps = parseInt(partySize || '2', 10) || 2;
      const data = await fetchAvailability(id, dateStr, ps);
      setSlots(data.slots || []);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    navigation.setOptions({ title: `Book · ${name}` });
    load();
  }, []);

  function openSeatPicker(slot: any) {
    const ps = parseInt(partySize || '2', 10) || 2;
    navigation.navigate('SeatPicker', { id, name, partySize: ps, slot });
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <View style={styles.row}>
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput value={dateStr} onChangeText={setDateStr} style={styles.input} autoCapitalize="none" />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Party Size</Text>
          <TextInput value={partySize} onChangeText={setPartySize} keyboardType="number-pad" style={styles.input} />
        </View>
        <Pressable onPress={load} style={styles.button}><Text style={styles.buttonText}>Find slots</Text></Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> :
        <FlatList
          data={slots}
          keyExtractor={(_, idx) => String(idx)}
          renderItem={({ item }) => {
            const count = item.count || 0;
            return (
              <View style={styles.slot}>
                <Text style={styles.slotText}>{timeFromISO(item.start)} – {timeFromISO(item.end)}</Text>
                <Text style={styles.count}>{count} tables</Text>
                <Pressable
                  onPress={() => openSeatPicker(item)}
                  disabled={count === 0}
                  style={[styles.bookBtn, count === 0 && { opacity: 0.4 }]}
                >
                  <Text style={styles.bookText}>Select table</Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={{ marginTop: 12, color: '#666' }}>No slots. Try another time or party size.</Text>}
        />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#fff' },
  filters: { gap: 8, marginBottom: 8 },
  row: { gap: 4 },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 },
  button: { backgroundColor: '#111', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  slot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, marginBottom: 8 },
  slotText: { fontSize: 16, fontWeight: '500' },
  count: { color: '#666', marginRight: 12 },
  bookBtn: { backgroundColor: '#0a7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  bookText: { color: 'white', fontWeight: '600' }
});
