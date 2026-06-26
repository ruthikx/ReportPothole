import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const MapView = ({ children, style }) => (
  <View style={[styles.mapFallback, style]}>
    <Text style={styles.mapText}>Map preview is available on mobile.</Text>
    {children}
  </View>
);

const Marker = () => null;

const styles = StyleSheet.create({
  mapFallback: {
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
  },
  mapText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});

export { Marker };
export default MapView;
