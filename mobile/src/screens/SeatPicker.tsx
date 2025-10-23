import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Alert, StyleSheet } from 'react-native';
import { fetchRestaurant, createReservation } from '../api';

type Slot = { start: string; end: string; available_table_ids: string[]; };

export default function SeatPicker({ route, navigation }: any) {
  const { id, name, partySize, slot }:{ id:string; name:string; partySize:number; slot:Slot } = route.params;
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    navigation.setOptions({ title: `Choose table · ${name}` });
    (async () => {
      const r = await fetchRestaurant(id);
      const map: Record<string,{id:string; label:string; capacity:number}> = {};
      for (const area of r.areas || []) {
        for (const t of area.tables || []) {
          map[t.id] = { id: t.id, label: t.name || `Table ${String(t.id).slice(0,6)}`, capacity: t.capacity || 2 };
        }
      }
      const list = (slot.available_table_ids || []).map(
        (tid:string) => map[tid] || {id:tid, label:`Table ${String(tid).slice(0,6)}`, capacity:2}
      );
      setTables(list);
      setLoading(false);
    })();
  }, [id]);

  async function book(tid: string) {
    try {
      const res = await createReservation({
        restaurant_id: id,
        party_size: partySize,
        start: slot.start,
        end: slot.end,
        guest_name: 'Demo Guest',
        guest_phone: '+994500000000',
        table_id: tid
      });
      Alert.alert('Booked!', `Reservation ID: ${res.id}`);
      navigation.goBack();
    } catch (e:any) {
      Alert.alert('Could not book', e.message || 'Unknown error');
    }
  }

  if (loading) return <View style={{padding:16}}><Text>Loading tables…</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Pick a table for {new Date(slot.start).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text>
      <FlatList
        data={tables}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.tlabel}>{item.label}</Text>
            <Text style={styles.cap}>cap {item.capacity}</Text>
            <Pressable onPress={() => book(item.id)} style={styles.btn}>
              <Text style={styles.btntxt}>Book</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={{color:'#666'}}>No tables free.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, padding:12, backgroundColor:'#fff' },
  subtitle: { marginBottom: 8, color:'#444' },
  row: { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
         borderWidth:1, borderColor:'#eee', borderRadius:12, padding:12, marginBottom:8 },
  tlabel: { fontWeight:'600' },
  cap: { color:'#666', marginRight:12 },
  btn: { backgroundColor:'#111', paddingVertical:8, paddingHorizontal:12, borderRadius:8 },
  btntxt: { color:'#fff', fontWeight:'600' }
});
