import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from '../worker/ResolveScreenMap';
import ReportCard from '../../components/ReportCard';
import { fetchCommunityReports, upvoteReport } from '../../services/reports';

const DEFAULT_REGION = {
  latitude: 22.3072,
  longitude: 73.1812,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const getCoordinate = (report) => {
  if (
    typeof report.location?.latitude !== 'number' ||
    typeof report.location?.longitude !== 'number'
  ) {
    return null;
  }

  return {
    latitude: report.location.latitude,
    longitude: report.location.longitude,
  };
};

const getClusterKey = (report, bucketSize) => {
  const coordinate = getCoordinate(report);
  if (!coordinate) return null;

  return [
    Math.round(coordinate.latitude / bucketSize),
    Math.round(coordinate.longitude / bucketSize),
  ].join(':');
};

const buildClusters = (reports, region) => {
  if (!region || region.latitudeDelta < 0.06) {
    return reports
      .filter(getCoordinate)
      .map((report) => ({
        id: report.id,
        coordinate: getCoordinate(report),
        reports: [report],
      }));
  }

  const bucketSize = region.latitudeDelta > 0.5 ? 0.04 : 0.015;
  const groups = new Map();

  reports.forEach((report) => {
    const key = getClusterKey(report, bucketSize);
    const coordinate = getCoordinate(report);
    if (!key || !coordinate) return;

    const group = groups.get(key) || {
      id: key,
      latitudeTotal: 0,
      longitudeTotal: 0,
      reports: [],
    };
    group.latitudeTotal += coordinate.latitude;
    group.longitudeTotal += coordinate.longitude;
    group.reports.push(report);
    groups.set(key, group);
  });

  return Array.from(groups.values()).map((group) => ({
    id: group.id,
    coordinate: {
      latitude: group.latitudeTotal / group.reports.length,
      longitude: group.longitudeTotal / group.reports.length,
    },
    reports: group.reports,
  }));
};

const MapScreen = ({ route }) => {
  const mapRef = useRef(null);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [upvoting, setUpvoting] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommunityReports({ limit: 100 });
      setReports(data.reports);

      const selected = data.reports.find((report) => report.id === route.params?.selectedReportId);
      if (selected) {
        setSelectedReport(selected);
        const coordinate = getCoordinate(selected);
        if (coordinate) {
          mapRef.current?.animateToRegion(
            {
              ...coordinate,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            },
            450
          );
        }
      }
    } catch (err) {
      console.log('Map reports failed', err.response?.data || err.message);
      Alert.alert('Unable to load map', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [route.params?.selectedReportId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const clusters = useMemo(() => buildClusters(reports, region), [reports, region]);

  const handleMarkerPress = (cluster) => {
    if (cluster.reports.length > 1) {
      const nextRegion = {
        latitude: cluster.coordinate.latitude,
        longitude: cluster.coordinate.longitude,
        latitudeDelta: Math.max(region.latitudeDelta / 2.5, 0.012),
        longitudeDelta: Math.max(region.longitudeDelta / 2.5, 0.012),
      };
      mapRef.current?.animateToRegion(nextRegion, 300);
      setRegion(nextRegion);
      setSelectedReport(cluster.reports[0]);
      return;
    }

    setSelectedReport(cluster.reports[0]);
  };

  const handleUpvote = async () => {
    if (!selectedReport) return;
    setUpvoting(true);

    try {
      const response = await upvoteReport(selectedReport);
      setSelectedReport((current) => ({ ...current, upvotes: response.upvotes }));
      setReports((currentReports) =>
        currentReports.map((report) =>
          report.id === selectedReport.id
            ? { ...report, upvotes: response.upvotes }
            : report
        )
      );
    } catch (err) {
      console.log('Map upvote failed', err.response?.data || err.message);
      Alert.alert('Upvote failed', 'Please try again in a moment.');
    } finally {
      setUpvoting(false);
    }
  };

  const selectedCoordinate = selectedReport ? getCoordinate(selectedReport) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapShell}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={DEFAULT_REGION}
          onRegionChangeComplete={setRegion}
          showsUserLocation
          showsMyLocationButton
        >
          {clusters.map((cluster) => {
            const isCluster = cluster.reports.length > 1;
            return (
              <Marker
                key={cluster.id}
                coordinate={cluster.coordinate}
                onPress={() => handleMarkerPress(cluster)}
              >
                <View style={[styles.marker, isCluster && styles.clusterMarker]}>
                  {isCluster ? (
                    <Text style={styles.clusterText}>{cluster.reports.length}</Text>
                  ) : (
                    <Ionicons name="alert" size={18} color="#FFFFFF" />
                  )}
                </View>
              </Marker>
            );
          })}
        </MapView>

        <View style={styles.topBar}>
          <View>
            <Text style={styles.title}>Pothole Map</Text>
            <Text style={styles.subtitle}>{reports.length} community reports</Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} style={styles.refreshButton} onPress={loadReports}>
            <Ionicons name="refresh" size={20} color="#1D160F" />
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color="#F25022" />
            <Text style={styles.loadingText}>Loading pins</Text>
          </View>
        )}

        {selectedReport && (
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleGroup}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {selectedReport.locationName}
                </Text>
                <Text style={styles.sheetMeta}>
                  {selectedReport.trackingId || selectedReport.reportId}
                  {selectedCoordinate
                    ? ` • ${selectedCoordinate.latitude.toFixed(4)}, ${selectedCoordinate.longitude.toFixed(4)}`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedReport(null)}>
                <Ionicons name="close" size={20} color="#5D5147" />
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}>
              {selectedReport.thumbnailUrl ? (
                <Image source={{ uri: selectedReport.thumbnailUrl }} style={styles.sheetImage} />
              ) : (
                <View style={styles.sheetImageFallback}>
                  <Ionicons name="image-outline" size={26} color="#B8AEA4" />
                </View>
              )}
              <View style={styles.detailCopy}>
                <Text style={styles.description} numberOfLines={3}>
                  {selectedReport.description || 'No description added yet.'}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.sheetUpvote}
                  onPress={handleUpvote}
                  disabled={upvoting}
                >
                  {upvoting ? (
                    <ActivityIndicator size="small" color="#F25022" />
                  ) : (
                    <Ionicons name="arrow-up-circle" size={18} color="#F25022" />
                  )}
                  <Text style={styles.sheetUpvoteText}>
                    {selectedReport.upvotes || 0} upvotes
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {!selectedReport && reports.length > 0 && (
          <View style={styles.peekCard}>
            <ReportCard
              compact
              report={reports[0]}
              onPress={() => setSelectedReport(reports[0])}
              onUpvote={() => setSelectedReport(reports[0])}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#FFF8F1',
    flex: 1,
  },
  mapShell: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 14,
    minHeight: 64,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 14,
    top: 30,
  },
  title: {
    color: '#1D160F',
    fontSize: 17,
    fontWeight: '900',
  },
  subtitle: {
    color: '#8B7D72',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: '#FFF4EC',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  marker: {
    alignItems: 'center',
    backgroundColor: '#F25022',
    borderColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 3,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  clusterMarker: {
    backgroundColor: '#1D160F',
    height: 42,
    width: 42,
  },
  clusterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  loadingPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    marginTop: 88,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  loadingText: {
    color: '#5D5147',
    fontSize: 12,
    fontWeight: '800',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    bottom: 0,
    left: 0,
    paddingBottom: 92,
    paddingHorizontal: 16,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#DDCEC0',
    borderRadius: 2,
    height: 4,
    marginBottom: 12,
    width: 44,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitleGroup: {
    flex: 1,
  },
  sheetTitle: {
    color: '#1D160F',
    fontSize: 16,
    fontWeight: '900',
  },
  sheetMeta: {
    color: '#8B7D72',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F6EFE8',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sheetImage: {
    backgroundColor: '#F2ECE6',
    borderRadius: 8,
    height: 96,
    width: 110,
  },
  sheetImageFallback: {
    alignItems: 'center',
    backgroundColor: '#F2ECE6',
    borderRadius: 8,
    height: 96,
    justifyContent: 'center',
    width: 110,
  },
  detailCopy: {
    flex: 1,
    justifyContent: 'space-between',
  },
  description: {
    color: '#5D5147',
    fontSize: 13,
    lineHeight: 19,
  },
  sheetUpvote: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4EC',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  sheetUpvoteText: {
    color: '#1D160F',
    fontSize: 13,
    fontWeight: '900',
  },
  peekCard: {
    bottom: 86,
    left: 16,
    position: 'absolute',
    right: 16,
  },
});

export default MapScreen;
