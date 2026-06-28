import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import ReportCard from '../../components/ReportCard';
import { fetchMyReports, upvoteReport } from '../../services/reports';

const ProfileScreen = ({ navigation, route, isAuthenticated, onLogout }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(isAuthenticated);
  const [refreshing, setRefreshing] = useState(false);
  const [upvotingId, setUpvotingId] = useState(null);

  const loadReports = useCallback(async ({ showSpinner = false } = {}) => {
    if (!isAuthenticated) {
      setLoading(false);
      setRefreshing(false);
      setReports([]);
      return;
    }

    if (showSpinner) setLoading(true);

    try {
      const data = await fetchMyReports({ limit: 50 });
      setReports(data.reports);
    } catch (err) {
      console.log('Profile reports failed', err.response?.data || err.message);
      if (err.response?.status === 401) {
        Alert.alert('Sign in required', 'Please sign in to see your submitted reports.');
      } else {
        Alert.alert('Unable to load reports', 'Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadReports({ showSpinner: true });
  }, [loadReports, route.params?.submittedReportId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadReports();
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('jwt_token');
    } catch {
      // RoleNavigator also clears the token; keep logout responsive if storage hiccups.
    }
    onLogout?.();
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
      console.log('Profile upvote failed', err.response?.data || err.message);
      Alert.alert('Upvote failed', 'Please try again in a moment.');
    } finally {
      setUpvotingId(null);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={28} color="#1D160F" />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {isAuthenticated ? `${reports.length} submitted reports` : 'Sign in to sync your reports'}
        </Text>
      </View>
      {isAuthenticated ? (
        <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={21} color="#1D160F" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Login')}>
          <Ionicons name="log-in-outline" size={21} color="#1D160F" />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderGuest = () => (
    <View style={styles.guestCard}>
      <Ionicons name="shield-checkmark" size={30} color="#F25022" />
      <Text style={styles.guestTitle}>Keep track of every Pothole</Text>
      <Text style={styles.guestText}>
        Create or sign in to a citizen account to see your submitted reports and repair status.
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
        <Ionicons name="log-in" size={18} color="#FFFFFF" />
        <Text style={styles.primaryText}>Sign in</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Track')}>
        <Ionicons name="search" size={18} color="#1D160F" />
        <Text style={styles.secondaryText}>Track by ID</Text>
      </TouchableOpacity>
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

    if (!isAuthenticated) return renderGuest();

    return (
      <View style={styles.emptyState}>
        <Ionicons name="receipt-outline" size={30} color="#8B7D72" />
        <Text style={styles.emptyTitle}>No submitted reports</Text>
        <Text style={styles.emptyText}>Reports you submit while signed in will appear here.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('ReportTab')}>
          <Ionicons name="camera" size={18} color="#FFFFFF" />
          <Text style={styles.primaryText}>Report now</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={isAuthenticated ? reports : []}
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
            compact
            showStatus
            report={item}
            onPress={() => navigation.navigate('Track', { initialReportId: item.reportId })}
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
    paddingBottom: 104,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#FF8A00',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: '#1D160F',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: '#8B7D72',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  centerState: {
    alignItems: 'center',
    minHeight: 220,
    justifyContent: 'center',
  },
  guestCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  guestTitle: {
    color: '#1D160F',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
  },
  guestText: {
    color: '#5D5147',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
    marginTop: 6,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#F25022',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#FFF4EC',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  secondaryText: {
    color: '#1D160F',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  emptyTitle: {
    color: '#1D160F',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 10,
  },
  emptyText: {
    color: '#8B7D72',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default ProfileScreen;
