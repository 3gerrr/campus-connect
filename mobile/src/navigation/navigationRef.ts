import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

// Both push types resolve to the same per-course feed screen -- there's no
// dedicated Deadlines screen to deep-link to instead. Lecturer-side
// deep-linking is out of scope: announcement senders are excluded from
// their own push fan-out, and reminders are student-only (RemindersService
// only loops enrolled students).
export function navigateFromPushData(data: any) {
  if (!navigationRef.isReady()) return;
  if (data?.type === 'announcement' || data?.type === 'deadline') {
    navigationRef.navigate('Announcements', { courseOfferingId: data.courseOfferingId } as never);
  }
}
