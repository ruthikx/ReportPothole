import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import api from '../../services/api';

const STATUS_COLORS = {
  open: '#f59e0b',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  resolved: '#10b981',
};

const TrackScreen = ({ navigation }) => {
  const [reportId, setReportId] = useState('');
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleTrack = async () => {
    if (!reportId.trim()) {
      Alert.alert('Error', 'Please enter a report ID');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await api.get(`/reports/${reportId.trim()}`);
      setTicket(response.data);
    } catch (err) {
      if (err.response?.status === 404) {
        Alert.alert('Not Found', 'No report found with this ID');
      } else {
        Alert.alert('Error', 'Failed to fetch report status');
      }
      setTicket(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Track a Report</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter Report ID (e.g. RPT-00423)"
        value={reportId}
        onChangeText={setReportId}
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.disabled]}
        onPress={handleTrack}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Track</Text>
        )}
      </TouchableOpacity>

      {ticket && (
        <View style={styles.card}>
          <Text style={styles.reportId}>{ticket.reportId}</Text>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: STATUS_COLORS[ticket.status] || '#999' },
            ]}
          >
            <Text style={styles.statusText}>
              {ticket.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>

          {ticket.description && (
            <Text style={styles.description}>{ticket.description}</Text>
          )}

          {ticket.ward && (
            <Text style={styles.info}>Ward: {ticket.ward.name}</Text>
          )}

          {ticket.assignedTo && (
            <Text style={styles.info}>
              Assigned to: {ticket.assignedTo.name}
            </Text>
          )}

          <Text style={styles.info}>
            Reported: {new Date(ticket.createdAt).toLocaleDateString()}
          </Text>

          {ticket.slaDeadline && (
            <Text style={styles.info}>
              SLA Deadline: {new Date(ticket.slaDeadline).toLocaleDateString()}
            </Text>
          )}

          {ticket.upvotes > 1 && (
            <Text style={styles.upvotes}>
              {ticket.upvotes} upvotes
            </Text>
          )}
        </View>
      )}

      {searched && !ticket && !loading && (
        <Text style={styles.notFound}>No report found with that ID</Text>
      )}
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
    marginBottom: 16,
    marginTop: Platform.OS === 'ios' ? 60 : 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  disabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reportId: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    color: '#555',
    marginBottom: 12,
  },
  info: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  upvotes: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '600',
    marginTop: 4,
  },
  notFound: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 20,
  },
});

export default TrackScreen;
