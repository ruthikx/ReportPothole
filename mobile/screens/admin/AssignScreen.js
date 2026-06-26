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

const AssignScreen = ({ route, navigation }) => {
  const { ticket } = route.params;
  const [workerId, setWorkerId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!workerId.trim()) {
      Alert.alert('Error', 'Please enter a worker ID');
      return;
    }

    setLoading(true);
    try {
      await api.patch(`/tickets/${ticket._id}/assign`, {
        workerId: workerId.trim(),
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
      <TextInput
        style={styles.input}
        placeholder="Enter Worker User ID"
        value={workerId}
        onChangeText={setWorkerId}
        autoCapitalize="none"
      />

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
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
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
