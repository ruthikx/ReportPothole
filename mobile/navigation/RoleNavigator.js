import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';

import LoginScreen from '../screens/auth/LoginScreen';
import ReportScreen from '../screens/citizen/ReportScreen';
import TrackScreen from '../screens/citizen/TrackScreen';
import MyTicketsScreen from '../screens/worker/MyTicketsScreen';
import ResolveScreen from '../screens/worker/ResolveScreen';
import AllTicketsScreen from '../screens/admin/AllTicketsScreen';
import AssignScreen from '../screens/admin/AssignScreen';
import EscalationsScreen from '../screens/admin/EscalationsScreen';

const Stack = createStackNavigator();

const CitizenStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Report" component={ReportScreen} />
    <Stack.Screen name="Track" component={TrackScreen} />
  </Stack.Navigator>
);

const WorkerStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MyTickets" component={MyTicketsScreen} />
    <Stack.Screen name="Resolve" component={ResolveScreen} />
  </Stack.Navigator>
);

const AdminStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AllTickets" component={AllTicketsScreen} />
    <Stack.Screen name="Assign" component={AssignScreen} />
    <Stack.Screen name="Escalations" component={EscalationsScreen} />
  </Stack.Navigator>
);

const RoleNavigator = () => {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const token = await AsyncStorage.getItem('jwt_token');
        if (token) {
          const decoded = jwtDecode(token);
          setRole(decoded.role);
        } else {
          setRole('guest');
        }
      } catch {
        setRole('guest');
      }
      setLoading(false);
    };
    loadRole();
  }, []);

  const handleLogin = (token) => {
    const decoded = jwtDecode(token);
    setRole(decoded.role);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('jwt_token');
    setRole('guest');
  };

  if (loading) return null;

  return (
    <NavigationContainer>
      {role === 'guest' && (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLogin={handleLogin} />}
          </Stack.Screen>
        </Stack.Navigator>
      )}
      {role === 'citizen' && (
        <CitizenStack />
      )}
      {role === 'worker' && (
        <WorkerStack />
      )}
      {role === 'admin' && (
        <AdminStack />
      )}
    </NavigationContainer>
  );
};

export default RoleNavigator;
