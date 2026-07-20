import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { api } from './api';
import { navigationRef } from '../navigation/navigationRef';

// Foreground notification behavior. Deadline reminders are always
// suppressed here -- useGlobalReminders.ts already shows an in-app Alert
// for those over the socket connection, so a duplicate OS banner would be
// redundant. Announcement banners are suppressed only when the user is
// already looking at that exact course's feed (they'll see it land live
// via the socket-driven list update); shown everywhere else.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { type?: string; courseOfferingId?: string };

    if (data?.type === 'deadline') {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
    }

    if (data?.type === 'announcement') {
      const current = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
      const alreadyViewing =
        current?.name === 'Announcements' &&
        (current.params as any)?.courseOfferingId === data.courseOfferingId;
      if (alreadyViewing) {
        return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
      }
    }

    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false };
  },
});

// Never throws -- permission denial, a simulator/emulator, or a missing
// EAS projectId should all be silent no-ops, not something that blocks
// login.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch {
    return null;
  }
}

export async function registerPushTokenWithBackend(): Promise<void> {
  try {
    const expoPushToken = await registerForPushNotificationsAsync();
    if (!expoPushToken) return;

    await api.post('/push-tokens', {
      expoPushToken,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? undefined,
    });
    await SecureStore.setItemAsync('expoPushToken', expoPushToken);
  } catch {
    // Best-effort -- a failed registration just means no push until the
    // next login/unlock retries it.
  }
}

export async function unregisterPushTokenWithBackend(): Promise<void> {
  try {
    const expoPushToken = await SecureStore.getItemAsync('expoPushToken');
    if (expoPushToken) {
      await api.post('/push-tokens/unregister', { expoPushToken });
    }
    await SecureStore.deleteItemAsync('expoPushToken');
  } catch {
    // Best-effort -- an offline logout just leaves the token registered
    // until it's reclaimed by a future login elsewhere.
  }
}
