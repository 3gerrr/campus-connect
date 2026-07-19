import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';

/**
 * Mounted once, at the navigator root, for as long as the user is logged
 * in -- deliberately NOT scoped to any single screen, since a deadline
 * reminder can fire while the student is looking at a totally different
 * course, or the Dashboard, or anywhere else in the app.
 *
 * HONEST LIMITATION: this only fires while the app is open and this
 * component is mounted. It is not a substitute for real OS-level push
 * (FCM/APNs) -- if the app is fully closed, nothing arrives. That gap is
 * tracked in the README; this hook covers "app open, reminder due,"
 * which is still real coverage, just not the whole story.
 */
export function useGlobalReminders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let activeSocket: Awaited<ReturnType<typeof getSocket>> | undefined;

    function handleReminder(payload: {
      deadlineId: string;
      title: string;
      category: string;
      dueAt: string;
      courseCode: string;
    }) {
      Alert.alert(
        `${payload.courseCode}: ${payload.category.replace('_', ' ')}`,
        `${payload.title}\nDue: ${new Date(payload.dueAt).toLocaleString()}`,
      );
      queryClient.invalidateQueries({ queryKey: ['upcoming-deadlines'] });
    }

    (async () => {
      const s = await getSocket();
      if (!isMounted) return;
      activeSocket = s;
      s.on('deadline:reminder', handleReminder);
    })();

    return () => {
      isMounted = false;
      activeSocket?.off('deadline:reminder', handleReminder);
    };
  }, [user, queryClient]);
}
