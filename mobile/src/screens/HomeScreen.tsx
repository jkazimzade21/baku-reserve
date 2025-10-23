import React, { useEffect, useState } from 'react';
import { View, TextInput, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { fetchRestaurants } from '../api';
import RestaurantCard from '../components/RestaurantCard';
export default function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<any[]>([]);
  async function load(q?: string) {
    setLoading(true);
    const items = await fetchRestaurants(q);
    setData(items);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder="Search restaurants or cuisines…"
                 value={query} onChangeText={setQuery} onSubmitEditing={() => load(query)} />
      {loading ? <ActivityIndicator /> :
        <FlatList data={data} keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RestaurantCard item={item}
              onPress={() => navigation.navigate('Restaurant', { id: item.id, name: item.name })} />
          )} />}
    </View>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, padding: 12 },
  search: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 8 } });