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
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_COLORS = {
  open: '#f59e0b',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  resolved: '#10b981',
};

const STATUS_OPTIONS = ['', 'open', 'assigned', 'in_progress', 'resolved'];

const AllTicketsScreen = ({ navigation, onLogout }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [wardFilter, setWardFilter] = useState('');
  const [wards, setWards] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchWards = async () => {
    try {
      const response = await api.get('/tickets/meta/wards');
      setWards(response.data.wards || []);
    } catch (err) {
      console.error('Failed to fetch wards:', err.message);
      setWards([]);
    }
  };

  const fetchTickets = async (pageNum = 1) => {
    try {
      const params = { page: pageNum, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (wardFilter) params.ward = wardFilter;

      const response = await api.get('/tickets', { params });
      setTickets(response.data.tickets);
      setTotalPages(response.data.pagination.pages);
      setPage(pageNum);
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
      fetchWards();
      fetchTickets();
    }, [statusFilter, wardFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
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
    return deadline && new Date(deadline) < new Date();
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Sign out of the admin console?', [
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

  const renderTicket = ({ item }) => (
    <TouchableOpacity
      style={[styles.ticketCard, isOverdue(item.slaDeadline) && styles.overdue]}
      onPress={() => navigation.navigate('Assign', { ticket: item })}
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
        <Text style={styles.description} numberOfLines={1}>
          {item.description}
        </Text>
      )}

      <View style={styles.ticketFooter}>
        <Text style={styles.ward}>
          {item.ward?.name || 'No ward'}
        </Text>
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
            {item.slaDeadline ? getSlaCountdown(item.slaDeadline) : 'No SLA'}
          </Text>
        </View>
      </View>

      {item.escalationLevel > 0 && (
        <View style={styles.escalationBadge}>
          <Text style={styles.escalationText}>
            Escalation Level {item.escalationLevel}
          </Text>
        </View>
      )}
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
        <Text style={styles.title}>All Tickets</Text>
        <TouchableOpacity
          accessibilityLabel="Sign out"
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          {STATUS_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.filterChip,
                statusFilter === s && styles.filterChipActive,
              ]}
              onPress={() => setStatusFilter(s)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === s && styles.filterChipTextActive,
                ]}
              >
                {s || 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              wardFilter === '' && styles.filterChipActive,
            ]}
            onPress={() => setWardFilter('')}
          >
            <Text
              style={[
                styles.filterChipText,
                wardFilter === '' && styles.filterChipTextActive,
              ]}
            >
              All wards
            </Text>
          </TouchableOpacity>
          {wards.map((ward) => (
            <TouchableOpacity
              key={ward._id}
              style={[
                styles.filterChip,
                wardFilter === ward._id && styles.filterChipActive,
              ]}
              onPress={() => setWardFilter(ward._id)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  wardFilter === ward._id && styles.filterChipTextActive,
                ]}
              >
                {ward.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={tickets}
        renderItem={renderTicket}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No tickets found</Text>
        }
      />

      <View style={styles.pagination}>
        <TouchableOpacity
          disabled={page <= 1}
          onPress={() => fetchTickets(page - 1)}
        >
          <Text style={[styles.pageButton, page <= 1 && styles.pageDisabled]}>
            Prev
          </Text>
        </TouchableOpacity>
        <Text style={styles.pageInfo}>
          {page} / {totalPages}
        </Text>
        <TouchableOpacity
          disabled={page >= totalPages}
          onPress={() => fetchTickets(page + 1)}
        >
          <Text
            style={[
              styles.pageButton,
              page >= totalPages && styles.pageDisabled,
            ]}
          >
            Next
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 8,
  },
  title: {
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
  filters: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    marginRight: 8,
    marginBottom: 8,
  },
  filterChipActive: {
    backgroundColor: '#1a73e8',
  },
  filterChipText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  filterChipTextActive: {
    color: '#fff',
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
  escalationBadge: {
    marginTop: 8,
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  escalationText: {
    fontSize: 11,
    color: '#e65100',
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  pageButton: {
    color: '#1a73e8',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  pageDisabled: {
    color: '#ccc',
  },
  pageInfo: {
    color: '#666',
    fontSize: 14,
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 60,
  },
});

export default AllTicketsScreen;
