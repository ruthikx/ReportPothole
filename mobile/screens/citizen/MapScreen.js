import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { WebView } from 'react-native-webview';
import ReportCard from '../../components/ReportCard';
import { fetchCommunityReports, upvoteReport } from '../../services/reports';

const DEFAULT_LAT = 22.3072;
const DEFAULT_LNG = 73.1812;
const DEFAULT_ZOOM = 13;

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

const buildLeafletHTML = (reports) => {
  const validReports = reports.filter(getCoordinate);

  const markerJS = validReports
    .map((r) => {
      const coord = getCoordinate(r);
      const name = (r.locationName || 'Report').replace(/'/g, "\\'");
      const desc = (r.description || 'No description').replace(/'/g, "\\'");
      const id = String(r.id).replace(/'/g, "\\'");
      return `
        (function() {
          var icon = L.divIcon({
            className: '',
            html: '<div style="width:32px;height:32px;background:#F25022;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3)"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          var marker = L.marker([${coord.latitude}, ${coord.longitude}], { icon: icon }).addTo(map);
          marker.on('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MARKER_PRESS',
              id: '${id}',
            }));
          });
        })();
      `;
    })
    .join('\n');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; }
        #map { width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: true }).setView([${DEFAULT_LAT}, ${DEFAULT_LNG}], ${DEFAULT_ZOOM});

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        ${markerJS}

        // Listen for commands from React Native
        document.addEventListener('message', handleMessage);
        window.addEventListener('message', handleMessage);

        function handleMessage(e) {
          try {
            var msg = JSON.parse(e.data);
            if (msg.type === 'FLY_TO') {
              map.setView([msg.latitude, msg.longitude], msg.zoom || 16);
            }
          } catch(err) {}
        }
      </script>
    </body>
    </html>
  `;
};

const MapScreen = ({ route }) => {
  const webViewRef = useRef(null);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upvoting, setUpvoting] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommunityReports({ limit: 100 });
      setReports(data.reports);

      const selected = data.reports.find(
        (report) => report.id === route.params?.selectedReportId
      );
      if (selected) {
        setSelectedReport(selected);
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

  // Fly to selected report once map is ready
  useEffect(() => {
    if (!mapReady || !selectedReport) return;
    const coord = getCoordinate(selectedReport);
    if (!coord) return;
    webViewRef.current?.injectJavaScript(`
      map.setView([${coord.latitude}, ${coord.longitude}], 16);
      true;
    `);
  }, [mapReady, selectedReport]);

  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MARKER_PRESS') {
        const report = reports.find((r) => String(r.id) === String(data.id));
        if (report) setSelectedReport(report);
      }
    } catch (err) {
      console.log('WebView message parse error', err);
    }
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

  // Rebuild HTML whenever reports change
  const leafletHTML = buildLeafletHTML(reports);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapShell}>

        <WebView
          ref={webViewRef}
          style={styles.map}
          source={{ html: leafletHTML }}
          onMessage={handleWebViewMessage}
          onLoad={() => setMapReady(true)}
          javaScriptEnabled
          originWhitelist={['*']}
        />

        {/* Top bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.title}>Pothole Map</Text>
            <Text style={styles.subtitle}>{reports.length} community reports</Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} style={styles.refreshButton} onPress={loadReports}>
            <Ionicons name="refresh" size={20} color="#1D160F" />
          </TouchableOpacity>
        </View>

        {/* Loading pill */}
        {loading && (
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color="#F25022" />
            <Text style={styles.loadingText}>Loading pins</Text>
          </View>
        )}

        {/* Selected report sheet */}
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

        {/* Peek card */}
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
