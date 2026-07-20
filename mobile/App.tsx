import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { navigateFromPushData } from './src/navigation/navigationRef';

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    // Cold start: the tap that launched the app happened before any
    // listener below could be attached -- addNotificationResponseReceivedListener
    // alone would miss it.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        navigateFromPushData(response.notification.request.content.data);
      }
    });

    // Warm/backgrounded: app already running when the notification is tapped.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromPushData(response.notification.request.content.data);
    });

    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}
