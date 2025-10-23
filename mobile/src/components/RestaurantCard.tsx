import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
export default function RestaurantCard({ item, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      {item.cover_photo && <Image source={{ uri: item.cover_photo }} style={styles.cover} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.sub}>{item.cuisine.join(' • ')}</Text>
        <Text style={styles.city}>{item.city}</Text>
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 12, borderWidth: 1, borderColor: '#eee',
          borderRadius: 12, marginBottom: 8, backgroundColor: 'white' },
  cover: { width: 90, height: 70, borderRadius: 10 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { color: '#666', marginTop: 2 },
  city: { color: '#999', marginTop: 2 }
});