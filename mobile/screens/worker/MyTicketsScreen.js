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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';

const STATUS_COLORS = {
  open: '#f59e0b',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  resolved: '#10b981',
};

const MyTicketsScreen = ({ navigation }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTickets = async () => {
    try {
      const response = await api.get('/tickets', {
        params: { status: 'assigned', limit: 100 },
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
    }, [])
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
    <View style={styles.container}>
      <Text style={styles.title}>My Assigned Tickets</Text>
      <FlatList
        data={tickets}
        renderItem={renderTicket}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No assigned tickets</Text>
        }
      />
    </View>
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
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
