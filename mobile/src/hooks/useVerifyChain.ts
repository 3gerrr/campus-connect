import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { api } from '../services/api';

type VerifyResult = {
  valid: boolean;
  checkedCount: number;
  brokenAtSequence?: number;
};

// A deliberate on-demand check, not something run automatically on every
// screen load -- this is an audit action ("prove to me nothing in this
// course's history has been altered"), not a background poll.
export function useVerifyChain(courseOfferingId: string) {
  return useMutation({
    mutationFn: async () =>
      (await api.get<VerifyResult>(`/announcements/offering/${courseOfferingId}/verify`)).data,
    onSuccess: (result) => {
      if (result.valid) {
        Alert.alert(
          'Integrity Verified',
          `All ${result.checkedCount} announcement${result.checkedCount === 1 ? '' : 's'} in this course's history check out -- none have been altered since posting.`,
        );
      } else {
        Alert.alert(
          'Integrity Check Failed',
          `Announcement #${result.brokenAtSequence} does not match its recorded hash. This course's history may have been altered -- contact your university administrator.`,
        );
      }
    },
    onError: () => {
      Alert.alert('Could not run integrity check', 'Please try again.');
    },
  });
}
