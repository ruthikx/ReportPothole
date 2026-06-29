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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { addToQueue, flushQueue, getQueueSummary } from '../../services/offlineQueue';

const uniqueParts = (parts) => [
  ...new Set(
    parts
      .map((part) => (part ? String(part).trim() : ''))
      .filter(Boolean)
  ),
];

const formatAddress = (place) => {
  if (!place) return '';

  const road = place.street || place.name;
  const area = place.district || place.subregion || place.city;
  const city = area === place.city ? null : place.city;

  return uniqueParts([road, area, city, place.region])
    .slice(0, 4)
    .join(', ');
};

const reverseGeocode = async ({ latitude, longitude }) => {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    return formatAddress(place);
  } catch (err) {
    console.log('Reverse geocode failed', err.message);
    return '';
  }
};

const ReportScreen = ({ navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  const cameraRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [locationLookupLoading, setLocationLookupLoading] = useState(false);
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
    let active = true;

    (async () => {
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      setHasLocationPermission(locationStatus.granted);

      if (locationStatus.granted) {
        const loc = await Location.getCurrentPositionAsync({});
        if (!active) return;

        setLocation(loc.coords);
        setLocationLookupLoading(true);
        const address = await reverseGeocode(loc.coords);
        if (!active) return;

        setLocationName(address);
        setLocationLookupLoading(false);
      }
    })();

    return () => {
      active = false;
    };
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
      if (locationName) {
        formData.append('address', locationName);
      }
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
      navigation.navigate('ProfileTab', { submittedReportId: reportId });
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
        if (locationName) {
          multipart.push({ name: 'address', value: locationName });
        }
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
        <ActivityIndicator size="large" color="#F25022" />
      </View>
    );
  }

  // Camera permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required</Text>
        <TouchableOpacity style={styles.submitButton} onPress={requestPermission}>
          <Text style={styles.submitText}>Grant Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.kicker}>New report</Text>
          <Text style={styles.title}>Report a Pothole</Text>
        </View>
        <TouchableOpacity style={styles.trackIconButton} onPress={() => navigation.navigate('Track')}>
          <Ionicons name="search" size={20} color="#1D160F" />
        </TouchableOpacity>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="camera" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.heroTitle}>Capture the pothole clearly</Text>
        <Text style={styles.heroText}>
          Location is attached automatically when you submit.
        </Text>
      </View>

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
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
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
                <Ionicons name="camera-reverse" size={22} color="#FFFFFF" />
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
        placeholder="Add a short description"
        placeholderTextColor="#9D8F83"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      {location && (
        <View style={styles.locationPill}>
          <Ionicons name="location" size={16} color="#F25022" />
          <View style={styles.locationCopy}>
            <Text style={styles.locationText} numberOfLines={2}>
              {locationLookupLoading
                ? 'Finding road and area...'
                : locationName || 'Location captured'}
            </Text>
            <Text style={styles.coordinateText}>
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.disabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send" size={18} color="#FFFFFF" />
            <Text style={styles.submitText}>Submit Report</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.staffLink} onPress={() => navigation.navigate('Login')}>
        <Ionicons name="person-circle-outline" size={18} color="#5D5147" />
        <Text style={styles.staffText}>Staff sign in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F1',
  },
  content: {
    paddingBottom: 112,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 16,
  },
  kicker: {
    color: '#F25022',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#1D160F',
    fontSize: 26,
    fontWeight: '900',
  },
  trackIconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#BA4B00',
    borderRadius: 8,
    marginBottom: 16,
    minHeight: 116,
    padding: 16,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    marginBottom: 8,
    width: 44,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  heroText: {
    color: '#FFE3C2',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  staffLink: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
  },
  staffText: {
    color: '#5D5147',
    fontSize: 13,
    fontWeight: '800',
  },
  queueCard: {
    backgroundColor: '#fff',
    borderLeftColor: '#F25022',
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
    color: '#1D160F',
    fontSize: 14,
    fontWeight: '900',
  },
  queueAction: {
    color: '#F25022',
    fontSize: 13,
    fontWeight: '900',
  },
  queueText: {
    color: '#5D5147',
    fontSize: 13,
  },
  queueError: {
    color: '#b45309',
    fontSize: 12,
    marginTop: 4,
  },
  cameraContainer: {
    height: 330,
    borderRadius: 8,
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
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    top: 20,
    right: 20,
    width: 42,
  },
  photoPreview: {
    height: 330,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    flex: 1,
  },
  retakeButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
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
    borderColor: '#EFE3D8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#1D160F',
    fontSize: 15,
    marginBottom: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  locationPill: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  locationCopy: {
    flex: 1,
  },
  locationText: {
    color: '#1D160F',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  coordinateText: {
    color: '#8B7D72',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#F25022',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingVertical: 14,
  },
  disabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  message: {
    textAlign: 'center',
    marginTop: 100,
    fontSize: 16,
    color: '#5D5147',
    marginBottom: 20,
  },
});

export default ReportScreen;
