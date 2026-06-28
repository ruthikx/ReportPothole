import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
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
      <StatusBar barStyle="dark-content" backgroundColor="#FFF8F1" />
      <RoleNavigator />
    </>
  );
}
