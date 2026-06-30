import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ReportCard from '../../components/ReportCard';
import { fetchCommunityReports, upvoteReport } from '../../services/reports';

const HomeFeedScreen = ({ navigation }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upvotingId, setUpvotingId] = useState(null);

  const loadReports = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) setLoading(true);

    try {
      const data = await fetchCommunityReports({ limit: 50 });
      setReports(data.reports);
    } catch (err) {
      console.log('Community feed failed', err.response?.data || err.message);
      Alert.alert('Unable to load feed', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReports({ showSpinner: true });
  }, [loadReports]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadReports();
  };

  const handleUpvote = async (report) => {
    const id = report.id || report.reportId;
    setUpvotingId(id);

    try {
      const response = await upvoteReport(report);
      setReports((currentReports) =>
        currentReports.map((item) =>
          (item.id || item.reportId) === id
            ? { ...item, upvotes: response.upvotes }
            : item
        )
      );
    } catch (err) {
      console.log('Upvote failed', err.response?.data || err.message);
      Alert.alert('Upvote failed', 'Please try again in a moment.');
    } finally {
      setUpvotingId(null);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.logo}>
          {/* <Ionicons name="construct" size={18} color="#1D160F" /> */}
          <Image source={require('../../assets/logo.png')} style={{ width: 38, height: 38 }} />
        </View>
        <Text style={styles.brand}>Pothole</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.reportHero}
        onPress={() => navigation.navigate('ReportTab')}
      >
        <View>
          <Text style={styles.heroTitle}>Report a Pothole</Text>
          <Text style={styles.heroSubtitle}>Snap, locate, submit</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="camera" size={24} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      <View style={styles.alertCard}>
        <Ionicons name="walk" size={22} color="#1D160F" />
        <View style={styles.alertCopy}>
          <Text style={styles.alertTitle}>Community reports</Text>
          <Text style={styles.alertText}>
            Upvote reports you encounter so repair teams can spot busy trouble points.
          </Text>
        </View>
      </View>

      <View style={styles.sectionTitleRow}>
        <View style={styles.liveDot} />
        <Text style={styles.sectionTitle}>Hot Potholes near you</Text>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator color="#F25022" size="large" />
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons name="map-outline" size={30} color="#8B7D72" />
        <Text style={styles.emptyTitle}>No reports yet</Text>
        <Text style={styles.emptyText}>Be the first to report a pothole in your area.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={reports}
        keyExtractor={(item) => String(item.id || item.reportId)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#F25022"
            colors={['#F25022']}
          />
        }
        renderItem={({ item }) => (
          <ReportCard
            report={item}
            showStatus
            onPress={() =>
              navigation.navigate('MapTab', {
                selectedReportId: item.id,
              })
            }
            onUpvote={() => handleUpvote(item)}
            upvoting={upvotingId === (item.id || item.reportId)}
          />
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#FFF8F1',
    flex: 1,
  },
  listContent: {
    paddingBottom: 80,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 2,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: '#FF8A00',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  brand: {
    color: '#1D160F',
    fontSize: 20,
    fontWeight: '900',
  },
  reportHero: {
    alignItems: 'center',
    backgroundColor: '#BA4B00',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    minHeight: 78,
    overflow: 'hidden',
    paddingHorizontal: 18,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#FFE3C2',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  alertCard: {
    alignItems: 'center',
    backgroundColor: '#FFECEF',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    padding: 14,
  },
  alertCopy: {
    flex: 1,
  },
  alertTitle: {
    color: '#E22518',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  alertText: {
    color: '#5D5147',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
  },
  liveDot: {
    backgroundColor: '#EF233C',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  sectionTitle: {
    color: '#1D160F',
    fontSize: 15,
    fontWeight: '900',
  },
  centerState: {
    alignItems: 'center',
    minHeight: 180,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: {
    color: '#1D160F',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
  },
  emptyText: {
    color: '#8B7D72',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default HomeFeedScreen;
