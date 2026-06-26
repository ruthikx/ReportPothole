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

const ESCALATION_COLORS = {
  0: '#e0e0e0',
  1: '#fff3e0',
  2: '#fde8e8',
  3: '#ef4444',
};

const ESCALATION_LABELS = {
  0: 'None',
  1: 'Supervisor',
  2: 'Engineer Officer',
  3: 'Commissioner',
};

const EscalationsScreen = ({ navigation }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverdue = async () => {
    try {
      const response = await api.get('/tickets/overdue');
      setTickets(response.data.tickets);
    } catch (err) {
      console.error('Failed to fetch overdue tickets:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchOverdue();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOverdue();
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

  const renderTicket = ({ item }) => (
    <View
      style={[
        styles.ticketCard,
        {
          borderLeftColor:
            ESCALATION_COLORS[item.escalationLevel] || '#e0e0e0',
        },
      ]}
    >
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketId}>{item.reportId}</Text>
        <View
          style={[
            styles.escalationBadge,
            {
              backgroundColor:
                ESCALATION_COLORS[item.escalationLevel] || '#e0e0e0',
            },
          ]}
        >
          <Text
            style={[
              styles.escalationText,
              item.escalationLevel >= 3 && styles.escalationTextWhite,
            ]}
          >
            Lvl {item.escalationLevel}: {ESCALATION_LABELS[item.escalationLevel] || 'Unknown'}
          </Text>
        </View>
      </View>

      {item.description && (
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.ticketFooter}>
        <Text style={styles.ward}>
          {item.ward?.name || 'No ward'}
        </Text>
        <View style={styles.slaBadge}>
          <Text style={styles.slaText}>
            {item.slaDeadline ? getSlaCountdown(item.slaDeadline) : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.daysOverdue}>
        Overdue since:{' '}
        {item.slaDeadline
          ? Math.ceil(
              (new Date() - new Date(item.slaDeadline)) / (1000 * 60 * 60 * 24)
            )
          : 0}{' '}
        days ago
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ef4444" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escalations</Text>
      <Text style={styles.subtitle}>
        Tickets past SLA deadline requiring attention
      </Text>

      <FlatList
        data={tickets}
        renderItem={renderTicket}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No overdue tickets. All SLA deadlines are being met.
          </Text>
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    paddingHorizontal: 16,
    paddingBottom: 16,
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
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
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
  escalationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  escalationText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#e65100',
  },
  escalationTextWhite: {
    color: '#fff',
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
    marginBottom: 4,
  },
  ward: {
    fontSize: 13,
    color: '#888',
  },
  slaBadge: {
    backgroundColor: '#fde8e8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  slaText: {
    fontSize: 12,
    color: '#c62828',
    fontWeight: '600',
  },
  daysOverdue: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 60,
    paddingHorizontal: 32,
  },
});

export default EscalationsScreen;
