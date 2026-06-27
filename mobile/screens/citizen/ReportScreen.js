import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { addToQueue, flushQueue, getQueueSummary } from '../../services/offlineQueue';

const ReportScreen = ({ navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  const cameraRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [facing, setFacing] = useState('back');
  const [queueSummary, setQueueSummary] = useState({
    total: 0,
    queued: 0,
    failed: 0,
    maxRetries: 0,
  });

  const refreshQueueSummary = useCallback(async () => {
    const summary = await getQueueSummary();
    setQueueSummary(summary);
  }, []);

  useEffect(() => {
    (async () => {
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locationStatus.granted);

      if (locationStatus.granted) {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshQueueSummary();
    }, [refreshQueueSummary])
  );

  const handleRetryQueue = async () => {
    await flushQueue();
    await refreshQueueSummary();
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const data = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      setPhoto(data);
    } catch (err) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
  };

  const toggleFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const handleSubmit = async () => {
    if (!photo) {
      Alert.alert('Error', 'Please take a photo of the pothole');
      return;
    }
    if (!location) {
      Alert.alert('Error', 'Unable to get location');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photos', {
        uri: photo.uri,
        type: 'image/jpeg',
        name: 'pothole.jpg',
      });
      formData.append('lat', location.latitude.toString());
      formData.append('lng', location.longitude.toString());
      if (description) {
        formData.append('description', description);
      }

      const response = await api.post('/reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { reportId } = response.data;
      Alert.alert(
        'Report Submitted',
        `Your pothole report ID is: ${reportId}\n\nYou can track the status using this ID.`,
        [{ text: 'OK' }]
      );

      setPhoto(null);
      setDescription('');
      navigation.navigate('Track', { initialReportId: reportId });
    } catch (err) {
      if (!err.response) {
        const multipart = [
          {
            name: 'photos',
            uri: photo.uri,
            type: 'image/jpeg',
            fileName: 'pothole.jpg',
          },
          { name: 'lat', value: location.latitude },
          { name: 'lng', value: location.longitude },
        ];
        if (description) {
          multipart.push({ name: 'description', value: description });
        }

        await addToQueue({
          method: 'post',
          url: '/reports',
          multipart,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        await refreshQueueSummary();
        Alert.alert('Saved offline', 'The report will be submitted when the device reconnects.');
        setPhoto(null);
        setDescription('');
        return;
      }

      console.log('Report submit failed', err.response?.data || err.message);
      const details = err.response?.data?.details;
      const message =
        (Array.isArray(details) && details.map((detail) => detail.message).join('\n')) ||
        err.response?.data?.error || 'Failed to submit report';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  // Permissions still loading
  if (!permission || hasLocationPermission === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  // Camera permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required</Text>
        <TouchableOpacity style={styles.submitButton} onPress={requestPermission}>
          <Text style={styles.submitText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Report a Pothole</Text>
      <TouchableOpacity style={styles.trackButton} onPress={() => navigation.navigate('Track')}>
        <Text style={styles.trackText}>Track existing report</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.loginText}>Staff sign in</Text>
      </TouchableOpacity>

      {queueSummary.total > 0 && (
        <View style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <Text style={styles.queueTitle}>Offline queue</Text>
            <TouchableOpacity onPress={handleRetryQueue} disabled={loading}>
              <Text style={styles.queueAction}>Retry now</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.queueText}>
            {queueSummary.queued} waiting to sync
            {queueSummary.failed > 0 ? `, ${queueSummary.failed} failed after retry` : ''}
          </Text>
          {queueSummary.failed > 0 && (
            <Text style={styles.queueError}>
              Check your connection and retry. Failed items stay saved on this device.
            </Text>
          )}
        </View>
      )}

      {photo ? (
        <View style={styles.photoPreview}>
          <Image source={{ uri: photo.uri }} style={styles.previewImage} />
          <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto}>
            <Text style={styles.retakeText}>Retake Photo</Text>
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

      <TextInput
        style={styles.input}
        placeholder="Describe the pothole (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      {location && (
        <Text style={styles.locationText}>
          Location: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.disabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit Report</Text>
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
    marginBottom: 16,
    marginTop: Platform.OS === 'ios' ? 60 : 16,
  },
  trackButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  trackText: {
    color: '#1a73e8',
    fontSize: 14,
    fontWeight: '600',
  },
  loginLink: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  loginText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  queueCard: {
    backgroundColor: '#fff',
    borderLeftColor: '#f59e0b',
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  queueHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  queueTitle: {
    color: '#333',
    fontSize: 14,
    fontWeight: '700',
  },
  queueAction: {
    color: '#1a73e8',
    fontSize: 13,
    fontWeight: '700',
  },
  queueText: {
    color: '#555',
    fontSize: 13,
  },
  queueError: {
    color: '#b45309',
    fontSize: 12,
    marginTop: 4,
  },
  cameraContainer: {
    height: 350,
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
    height: 350,
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
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  locationText: {
    color: '#666',
    fontSize: 13,
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
  submitText: {
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
  },
});

export default ReportScreen;
