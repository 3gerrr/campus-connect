import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';

/**
 * Joins the `course:<id>` room for as long as the calling screen is
 * mounted, and invalidates `queryKey` whenever the backend broadcasts a new
 * or shared announcement for that course -- so the existing pull-to-refresh
 * screens update live without any change to how they fetch data.
 *
 * Deliberately does NOT disconnect the shared socket on unmount (see
 * services/socket.ts) -- it only leaves its own room, since other screens
 * may still be using the same connection.
 */
export function useCourseRealtime(courseOfferingId: string | undefined, queryKey: unknown[]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!courseOfferingId) return;

    let isMounted = true;
    let activeSocket: Awaited<ReturnType<typeof getSocket>> | undefined;

    function handleUpdate() {
      queryClient.invalidateQueries({ queryKey });
    }

    (async () => {
      const s = await getSocket();
      if (!isMounted) return; // screen unmounted while the socket was connecting
      activeSocket = s;
      s.emit('subscribe:course', courseOfferingId);
      s.on('announcement:new', handleUpdate);
      s.on('announcement:shared', handleUpdate);
    })();

    return () => {
      isMounted = false;
      if (activeSocket) {
        activeSocket.emit('unsubscribe:course', courseOfferingId);
        activeSocket.off('announcement:new', handleUpdate);
        activeSocket.off('announcement:shared', handleUpdate);
      }
    };
  }, [courseOfferingId, queryClient]);
}
