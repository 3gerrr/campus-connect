import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://your-backend-domain.com';

// A single shared connection for the whole app, not one per screen. Screens
// join/leave rooms on top of this connection (see useCourseRealtime) --
// reconnecting per screen would be wasteful and would also mean every
// screen re-does the JWT handshake independently.
let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket && socket.connected) return socket;

  const token = await SecureStore.getItemAsync('accessToken');

  socket = io(API_BASE_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  });

  return socket;
}

// Called on logout so a subsequent login (possibly as a different user on
// the same device) doesn't inherit a socket authenticated as the old user.
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
