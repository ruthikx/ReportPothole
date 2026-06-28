import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const STATUS_COLORS = {
  open: '#C23B22',
  assigned: '#8A4B00',
  in_progress: '#245BB5',
  resolved: '#116B3A',
};

const STATUS_LABELS = {
  open: 'Pending',
  assigned: 'In Review',
  in_progress: 'In Review',
  resolved: 'Fixed',
};

const TrackScreen = ({ route }) => {
  const initialReportId = route.params?.initialReportId || '';
  const [reportId, setReportId] = useState(initialReportId);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleTrack = async (overrideReportId) => {
    const lookupReportId = (
      typeof overrideReportId === 'string' ? overrideReportId : reportId
    ).trim();
    if (!lookupReportId) {
      Alert.alert('Error', 'Please enter a report ID');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await api.get(`/reports/${lookupReportId}`);
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

  useEffect(() => {
    if (initialReportId) {
      handleTrack(initialReportId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReportId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Track Report</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Enter Report ID (e.g. RPT-00423)"
        placeholderTextColor="#9D8F83"
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
          <>
            <Ionicons name="search" size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>Track</Text>
          </>
        )}
      </TouchableOpacity>

      {ticket && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.reportId}>{ticket.reportId}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${STATUS_COLORS[ticket.status] || '#999'}22` },
              ]}
            >
              <Text style={[styles.statusText, { color: STATUS_COLORS[ticket.status] || '#999' }]}>
                {ticket.statusLabel || STATUS_LABELS[ticket.status] || ticket.status}
              </Text>
            </View>
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
            Reported {new Date(ticket.createdAt).toLocaleDateString()}
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
    backgroundColor: '#FFF8F1',
  },
  content: {
    padding: 16,
    paddingBottom: 112,
  },
  headerRow: {
    marginBottom: 16,
  },
  title: {
    color: '#1D160F',
    fontSize: 26,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EFE3D8',
    borderRadius: 8,
    color: '#1D160F',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#F25022',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 14,
    marginBottom: 24,
  },
  disabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#fff',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reportId: {
    color: '#1D160F',
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '900',
  },
  description: {
    fontSize: 15,
    color: '#5D5147',
    lineHeight: 21,
    marginBottom: 12,
  },
  info: {
    fontSize: 14,
    color: '#5D5147',
    marginBottom: 6,
  },
  upvotes: {
    fontSize: 14,
    color: '#F25022',
    fontWeight: '900',
    marginTop: 4,
  },
  notFound: {
    textAlign: 'center',
    color: '#8B7D72',
    fontSize: 16,
    marginTop: 20,
  },
});

export default TrackScreen;
