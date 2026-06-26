import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import RoleNavigator from './navigation/RoleNavigator';
import { setupOfflineListener } from './services/offlineQueue';

export default function App() {
  useEffect(() => {
    const unsubscribe = setupOfflineListener();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <RoleNavigator />
    </>
  );
}
