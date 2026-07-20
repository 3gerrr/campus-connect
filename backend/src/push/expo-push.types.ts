// Local shapes for Expo's push API request/response bodies -- no SDK
// dependency, plain fetch() against https://exp.host/--/api/v2/push/*.
// See https://docs.expo.dev/push-notifications/sending-notifications/

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}
