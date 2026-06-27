import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';

const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (isRegister && !trimmedName) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (isRegister && password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      let response;
      if (isRegister) {
        response = await api.post('/auth/register', {
          name: trimmedName,
          email: trimmedEmail,
          password,
        });
      } else {
        response = await api.post('/auth/login', {
          email: trimmedEmail,
          password,
        });
      }

      const { token } = response.data;
      await AsyncStorage.setItem('jwt_token', token);
      onLogin(token);
    } catch (err) {
      console.log('Auth request failed', err.response?.data || err.message);
      const details = err.response?.data?.details;
      const message =
        (Array.isArray(details) && details.map((detail) => detail.message).join('\n')) ||
        err.response?.data?.error || 'Something went wrong. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Pothole Reporter</Text>
        <Text style={styles.subtitle}>
          {isRegister ? 'Create an Account' : 'Sign In'}
        </Text>

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isRegister ? 'Register' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
          <Text style={styles.switchText}>
            {isRegister
              ? 'Already have an account? Sign In'
              : "Don't have an account? Register"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a73e8',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
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
  button: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    color: '#1a73e8',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
});

export default LoginScreen;
