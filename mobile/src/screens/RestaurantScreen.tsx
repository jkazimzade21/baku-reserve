import React, { useEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet, Pressable, Alert } from 'react-native';
import { fetchRestaurant } from '../api';

export default function RestaurantScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchRestaurant(id);
        setData(r);
        navigation.setOptions({ title: r.name || 'Restaurant' });
      } catch (e:any) {
        Alert.alert('Error', e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;
  if (!data) return <Text>Not found</Text>;

  return (
    <View style={styles.container}>
      {data.photos?.[0] && <Image source={{ uri: data.photos[0] }} style={styles.cover} />}
      <Text style={styles.title}>{data.name}</Text>
      <Text style={styles.sub}>{(data.cuisine || []).join(' • ')}</Text>
      <Text style={styles.addr}>{data.address || ''}</Text>
      <Text style={styles.phone}>{data.phone || ''}</Text>

      <Pressable
        onPress={() => navigation.navigate('Book', { id: data.id, name: data.name })}
        style={styles.bookBtn}
      >
        <Text style={styles.bookTxt}>Book a table</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  cover: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '600' },
  sub: { marginTop: 4, color: '#555' },
  addr: { marginTop: 8 },
  phone: { marginTop: 4, color: '#333' },
  bookBtn: { marginTop: 16, backgroundColor: '#111', padding: 12, borderRadius: 10, alignItems: 'center' },
  bookTxt: { color: '#fff', fontWeight: '600' }
});
