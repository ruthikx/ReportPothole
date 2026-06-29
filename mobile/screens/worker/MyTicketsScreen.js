import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { flushQueue, getQueueSummary } from '../../services/offlineQueue';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_COLORS = {
  open: '#f59e0b',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  resolved: '#10b981',
};

const MyTicketsScreen = ({ navigation, onLogout }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const fetchTickets = async () => {
    try {
      const response = await api.get('/tickets', {
        params: { status: 'assigned,in_progress', limit: 100 },
      });
      setTickets(response.data.tickets);
    } catch (err) {
      console.error('Failed to fetch tickets:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchTickets();
      refreshQueueSummary();
    }, [refreshQueueSummary])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
    refreshQueueSummary();
  };

  const handleRetryQueue = async () => {
    await flushQueue();
    await refreshQueueSummary();
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Sign out of the worker app?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.removeItem('jwt_token');
          } finally {
            onLogout?.();
          }
        },
      },
    ]);
  };

  const getSlaCountdown = (deadline) => {
    const now = new Date();
    const sla = new Date(deadline);
    const diff = sla - now;
    if (diff <= 0) return 'OVERDUE';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h`;
  };

  const isOverdue = (deadline) => {
    return new Date(deadline) < new Date();
  };

  const renderTicket = ({ item }) => (
    <TouchableOpacity
      style={[styles.ticketCard, isOverdue(item.slaDeadline) && styles.overdue]}
      onPress={() => navigation.navigate('Resolve', { ticket: item })}
    >
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketId}>{item.reportId}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[item.status] || '#999' },
          ]}
        >
          <Text style={styles.statusText}>
            {item.status.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      {item.description && (
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.ticketFooter}>
        {item.ward && <Text style={styles.ward}>{item.ward.name}</Text>}
        <View
          style={[
            styles.slaBadge,
            isOverdue(item.slaDeadline) && styles.slaOverdue,
          ]}
        >
          <Text
            style={[
              styles.slaText,
              isOverdue(item.slaDeadline) && styles.slaTextOverdue,
            ]}
          >
            {getSlaCountdown(item.slaDeadline)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Work Tickets</Text>
        <TouchableOpacity
          accessibilityLabel="Sign out"
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color="#333" />
        </TouchableOpacity>
      </View>
      {queueSummary.total > 0 && (
        <View style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <Text style={styles.queueTitle}>Offline queue</Text>
            <TouchableOpacity onPress={handleRetryQueue}>
              <Text style={styles.queueAction}>Retry now</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.queueText}>
            {queueSummary.queued} waiting to sync
            {queueSummary.failed > 0 ? `, ${queueSummary.failed} failed after retry` : ''}
          </Text>
          {queueSummary.failed > 0 && (
            <Text style={styles.queueError}>
              Failed items remain saved on this device until they sync.
            </Text>
          )}
        </View>
      )}
      <FlatList
        data={tickets}
        renderItem={renderTicket}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No assigned or in-progress tickets</Text>
        }
      />
    </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#ddd',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  queueCard: {
    backgroundColor: '#fff',
    borderLeftColor: '#f59e0b',
    borderLeftWidth: 4,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
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
  list: {
    padding: 16,
    paddingTop: 0,
  },
  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  overdue: {
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ward: {
    fontSize: 13,
    color: '#888',
  },
  slaBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  slaOverdue: {
    backgroundColor: '#fde8e8',
  },
  slaText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
  },
  slaTextOverdue: {
    color: '#c62828',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 60,
  },
});

export default MyTicketsScreen;
