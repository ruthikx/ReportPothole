import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import api from '../../services/api';

const AssignScreen = ({ route, navigation }) => {
  const { ticket } = route.params;
  const [workerId, setWorkerId] = useState('');
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const params = ticket.ward?._id ? { ward: ticket.ward._id } : {};
        const response = await api.get('/tickets/meta/workers', { params });
        setWorkers(response.data.workers || []);
      } catch (err) {
        console.error('Failed to fetch workers:', err.message);
        setWorkers([]);
      }
    };

    fetchWorkers();
  }, [ticket.ward?._id]);

  const handleAssign = async () => {
    if (!workerId) {
      Alert.alert('Error', 'Please select a worker');
      return;
    }

    setLoading(true);
    try {
      await api.patch(`/tickets/${ticket._id}/assign`, {
        workerId,
      });

      Alert.alert('Success', `Ticket ${ticket.reportId} assigned`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to assign ticket';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Assign Ticket</Text>
      <Text style={styles.reportId}>{ticket.reportId}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{ticket.status}</Text>

        {ticket.ward && (
          <>
            <Text style={styles.label}>Ward</Text>
            <Text style={styles.value}>{ticket.ward.name}</Text>
          </>
        )}

        {ticket.description && (
          <>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.value}>{ticket.description}</Text>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Assign to Worker</Text>
      <View style={styles.workerList}>
        {workers.map((worker) => (
          <TouchableOpacity
            key={worker._id}
            style={[
              styles.workerOption,
              workerId === worker._id && styles.workerOptionActive,
            ]}
            onPress={() => setWorkerId(worker._id)}
          >
            <View>
              <Text
                style={[
                  styles.workerName,
                  workerId === worker._id && styles.workerNameActive,
                ]}
              >
                {worker.name}
              </Text>
              <Text
                style={[
                  styles.workerMeta,
                  workerId === worker._id && styles.workerMetaActive,
                ]}
              >
                {worker.phone || worker.email || worker.ward?.name || 'Worker'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
        {workers.length === 0 && (
          <Text style={styles.emptyWorkers}>No workers found for this ward</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.assignButton, loading && styles.disabled]}
        onPress={handleAssign}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.assignText}>Assign Ticket</Text>
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
    marginBottom: 4,
    marginTop: Platform.OS === 'ios' ? 60 : 16,
  },
  reportId: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a73e8',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
    marginTop: 8,
  },
  value: {
    fontSize: 15,
    color: '#333',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  workerList: {
    marginBottom: 16,
  },
  workerOption: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  workerOptionActive: {
    backgroundColor: '#e8f0fe',
    borderColor: '#1a73e8',
  },
  workerName: {
    color: '#333',
    fontSize: 15,
    fontWeight: '700',
  },
  workerNameActive: {
    color: '#1a73e8',
  },
  workerMeta: {
    color: '#777',
    fontSize: 13,
    marginTop: 2,
  },
  workerMetaActive: {
    color: '#1a73e8',
  },
  emptyWorkers: {
    color: '#888',
    fontSize: 14,
    marginBottom: 16,
  },
  assignButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
  assignText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AssignScreen;
