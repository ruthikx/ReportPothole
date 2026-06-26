import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import MapView, { Marker } from './ResolveScreenMap';
import api from '../../services/api';
import { addToQueue } from '../../services/offlineQueue';

const ResolveScreen = ({ route, navigation }) => {
  const { ticket } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [facing, setFacing] = useState('back');

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const data = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      setAfterPhoto(data);
    } catch (err) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const retakePhoto = () => {
    setAfterPhoto(null);
  };

  const toggleFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const handleResolve = async () => {
    if (!afterPhoto) {
      Alert.alert('Error', 'Please take an after-photo to confirm resolution');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('afterPhoto', {
        uri: afterPhoto.uri,
        type: 'image/jpeg',
        name: 'resolved.jpg',
      });

      await api.patch(`/tickets/${ticket._id}/status`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { status: 'resolved' },
      });

      Alert.alert('Success', 'Ticket marked as resolved', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      if (err.message && err.message.includes('Network')) {
        await addToQueue({
          method: 'patch',
          url: `/tickets/${ticket._id}/status`,
          data: {
            status: 'resolved',
            afterPhoto: afterPhoto.uri,
          },
        });
        Alert.alert(
          'Offline',
          'You are offline. The resolution will be submitted when you reconnect.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        const message = err.response?.data?.error || 'Failed to update ticket';
        Alert.alert('Error', message);
      }
    } finally {
      setLoading(false);
    }
  };

  const lng = ticket.location?.coordinates?.[0];
  const lat = ticket.location?.coordinates?.[1];

  // Camera permission still loading
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  // Camera permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required to resolve tickets</Text>
        <TouchableOpacity style={styles.resolveButton} onPress={requestPermission}>
          <Text style={styles.resolveText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Resolve Ticket</Text>
      <Text style={styles.reportId}>{ticket.reportId}</Text>

      {ticket.description && (
        <Text style={styles.description}>{ticket.description}</Text>
      )}

      {lat && lng && (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <Marker coordinate={{ latitude: lat, longitude: lng }} />
          </MapView>
        </View>
      )}

      <Text style={styles.sectionTitle}>Before Photo</Text>
      {ticket.photos?.before?.length > 0 ? (
        <Text style={styles.note}>Before photos are available on the server</Text>
      ) : (
        <Text style={styles.note}>No before photos</Text>
      )}

      <Text style={styles.sectionTitle}>After Photo (Required)</Text>
      {afterPhoto ? (
        <View style={styles.photoPreview}>
          <Image source={{ uri: afterPhoto.uri }} style={styles.previewImage} />
          <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto}>
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
          >
            <View style={styles.cameraControls}>
              <TouchableOpacity style={styles.flipButton} onPress={toggleFacing}>
                <Text style={styles.flipText}>Flip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
                <View style={styles.captureInner} />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}

      <TouchableOpacity
        style={[styles.resolveButton, loading && styles.disabled]}
        onPress={handleResolve}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.resolveText}>Mark as Resolved</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    marginTop: Platform.OS === 'ios' ? 60 : 16,
  },
  reportId: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a73e8',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#555',
    marginBottom: 16,
  },
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  map: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 8,
  },
  note: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  cameraContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 20,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  flipButton: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  flipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  photoPreview: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    flex: 1,
  },
  retakeButton: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retakeText: {
    color: '#fff',
    fontWeight: '600',
  },
  resolveButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  disabled: {
    opacity: 0.7,
  },
  resolveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    textAlign: 'center',
    marginTop: 100,
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
});

export default ResolveScreen;