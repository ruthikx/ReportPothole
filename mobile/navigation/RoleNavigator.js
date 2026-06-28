import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import { Ionicons } from '@expo/vector-icons';

import LoginScreen from '../screens/auth/LoginScreen';
import HomeFeedScreen from '../screens/citizen/HomeFeedScreen';
import MapScreen from '../screens/citizen/MapScreen';
import ReportScreen from '../screens/citizen/ReportScreen';
import ProfileScreen from '../screens/citizen/ProfileScreen';
import TrackScreen from '../screens/citizen/TrackScreen';
import MyTicketsScreen from '../screens/worker/MyTicketsScreen';
import ResolveScreen from '../screens/worker/ResolveScreen';
import AllTicketsScreen from '../screens/admin/AllTicketsScreen';
import AssignScreen from '../screens/admin/AssignScreen';
import EscalationsScreen from '../screens/admin/EscalationsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  HomeTab: ['home', 'home-outline'],
  MapTab: ['map', 'map-outline'],
  ReportTab: ['camera', 'camera-outline'],
  ProfileTab: ['person', 'person-outline'],
};

const CitizenTabs = ({ isAuthenticated, onLogout }) => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: '#F25022',
      tabBarInactiveTintColor: '#5D5147',
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '800',
        paddingBottom: 6,
      },
      tabBarStyle: {
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderColor: '#EFE3D8',
        borderRadius: 20,
        borderTopWidth: 1,
        bottom: 60,
        height: 66,
        left: 16,
        paddingTop: 6,
        position: 'absolute',
        right: 16,
      },
      tabBarIcon: ({ color, focused, size }) => {
        const icons = TAB_ICONS[route.name] || TAB_ICONS.HomeTab;
        return (
          <Ionicons
            name={focused ? icons[0] : icons[1]}
            color={color}
            size={route.name === 'ReportTab' ? size + 2 : size}
          />
        );
      },
    })}
  >
    <Tab.Screen
      name="HomeTab"
      component={HomeFeedScreen}
      options={{ title: 'Home' }}
    />
    <Tab.Screen
      name="MapTab"
      component={MapScreen}
      options={{ title: 'Map' }}
    />
    <Tab.Screen
      name="ReportTab"
      component={ReportScreen}
      options={{ title: 'Report' }}
    />
    <Tab.Screen name="ProfileTab" options={{ title: 'Profile' }}>
      {(props) => (
        <ProfileScreen
          {...props}
          isAuthenticated={isAuthenticated}
          onLogout={onLogout}
        />
      )}
    </Tab.Screen>
  </Tab.Navigator>
);

const CitizenStack = ({ onLogin, onLogout, isAuthenticated }) => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Community">
      {(props) => (
        <CitizenTabs
          {...props}
          isAuthenticated={isAuthenticated}
          onLogout={onLogout}
        />
      )}
    </Stack.Screen>
    <Stack.Screen name="Track" component={TrackScreen} />
    <Stack.Screen name="Login">
      {(props) => (
        <LoginScreen
          {...props}
          onLogin={(token) => {
            onLogin(token);
            props.navigation.reset({
              index: 0,
              routes: [{ name: 'Community' }],
            });
          }}
        />
      )}
    </Stack.Screen>
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
      {['guest', 'citizen'].includes(role) && (
        <CitizenStack
          onLogin={handleLogin}
          onLogout={handleLogout}
          isAuthenticated={role === 'citizen'}
        />
      )}
      {role === 'worker' && (
        <WorkerStack />
      )}
      {['engineer', 'supervisor', 'commissioner', 'admin'].includes(role) && (
        <AdminStack />
      )}
    </NavigationContainer>
  );
};

export default RoleNavigator;
