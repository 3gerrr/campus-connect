import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import { useCourseRealtime } from '../hooks/useCourseRealtime';
import { useVerifyChain } from '../hooks/useVerifyChain';

type Announcement = {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  sender: { name: string; role: string };
  attachments: { id: string }[];
};

type RepApplication = {
  id: string;
  type: string;
  status: string;
  applicationNote: string | null;
  user: { name: string; email: string };
};

export default function LecturerCourseScreen({ route, navigation }: any) {
  const { courseOfferingId, courseLabel } = route.params;
  const queryClient = useQueryClient();

  const announcementsQuery = useQuery<Announcement[]>({
    queryKey: ['announcements', courseOfferingId],
    queryFn: async () => (await api.get(`/announcements/offering/${courseOfferingId}`)).data,
  });

  const applicantsQuery = useQuery<RepApplication[]>({
    queryKey: ['rep-applicants', courseOfferingId],
    queryFn: async () => (await api.get(`/representatives/offering/${courseOfferingId}`)).data,
  });

  // Live updates: a student amplifying/posting shows up here without the
  // lecturer needing to pull to refresh mid-lecture.
  useCourseRealtime(courseOfferingId, ['announcements', courseOfferingId]);

  const verifyChain = useVerifyChain(courseOfferingId);

  const decisionMutation = useMutation({
    mutationFn: ({ repId, approve }: { repId: string; approve: boolean }) =>
      api.patch(`/representatives/${repId}/decision`, { approve }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rep-applicants', courseOfferingId] }),
    onError: (err: any) => {
      Alert.alert('Action failed', err?.response?.data?.message || 'Please try again.');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (repId: string) => api.patch(`/representatives/${repId}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rep-applicants', courseOfferingId] }),
    onError: (err: any) => {
      Alert.alert('Could not revoke', err?.response?.data?.message || 'Please try again.');
    },
  });

  const confirmRevoke = (repId: string, name: string) => {
    Alert.alert(
      'Revoke representative status?',
      `${name} will no longer be able to post announcements for this course.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => revokeMutation.mutate(repId) },
      ],
    );
  };

  const pendingApplicants = applicantsQuery.data?.filter((a) => a.status === 'PENDING') ?? [];
  const approvedReps = applicantsQuery.data?.filter((a) => a.status === 'APPROVED') ?? [];

  const refreshAll = () => {
    announcementsQuery.refetch();
    applicantsQuery.refetch();
  };

  const isRefetching = announcementsQuery.isRefetching || applicantsQuery.isRefetching;

  const header = (
    <View>
      <Pressable
        style={styles.verifyRow}
        onPress={() => verifyChain.mutate()}
        disabled={verifyChain.isPending}
      >
        {verifyChain.isPending ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text style={styles.verifyText}>🔒 Verify this course's announcement history</Text>
        )}
      </Pressable>

      {pendingApplicants.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.sectionTitle}>
            Pending Representative Applications ({pendingApplicants.length})
          </Text>
          {pendingApplicants.map((applicant) => (
            <View key={applicant.id} style={styles.applicantCard}>
              <Text style={styles.applicantName}>{applicant.user.name}</Text>
              <Text style={styles.applicantEmail}>{applicant.user.email}</Text>
              {applicant.applicationNote ? (
                <Text style={styles.applicantNote}>"{applicant.applicationNote}"</Text>
              ) : null}
              <View style={styles.applicantActions}>
                <Pressable
                  style={styles.approveButton}
                  onPress={() => decisionMutation.mutate({ repId: applicant.id, approve: true })}
                >
                  <Text style={styles.approveButtonText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={styles.rejectButton}
                  onPress={() => decisionMutation.mutate({ repId: applicant.id, approve: false })}
                >
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {approvedReps.length > 0 && (
        <View style={styles.approvedSection}>
          <Text style={styles.sectionTitle}>Approved Representatives</Text>
          {approvedReps.map((rep) => (
            <View key={rep.id} style={styles.approvedCard}>
              <View>
                <Text style={styles.applicantName}>{rep.user.name}</Text>
                <Text style={styles.applicantEmail}>{rep.type === 'PRIMARY' ? 'Primary' : 'Assistant'} Rep</Text>
              </View>
              <Pressable
                style={styles.revokeButton}
                onPress={() => confirmRevoke(rep.id, rep.user.name)}
              >
                <Text style={styles.revokeButtonText}>Revoke</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Announcements</Text>
    </View>
  );

  if (announcementsQuery.isLoading || applicantsQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.list}
        data={announcementsQuery.data}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refreshAll} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No announcements posted yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.type}>{item.category.replace('_', ' ')}</Text>
              <Text style={styles.sender}>{item.sender.name}</Text>
            </View>
            <Text style={styles.content}>{item.content}</Text>
            {item.attachments.length > 0 && (
              <Text style={styles.attachmentNote}>
                {item.attachments.length} attachment{item.attachments.length > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        )}
      />

      <Pressable
        style={styles.composeButton}
        onPress={() => navigation.navigate('ComposeAnnouncement', { courseOfferingId, courseLabel })}
      >
        <Text style={styles.composeButtonText}>+ Post Announcement</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  list: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6FA' },
  emptyText: { textAlign: 'center', color: '#8A93A6', marginTop: 24 },
  verifyRow: {
    backgroundColor: '#EDEFF5',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  verifyText: { fontSize: 12, color: '#5A6478', fontWeight: '600' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5A6478',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  pendingSection: { backgroundColor: '#FFF7E6', paddingBottom: 8, marginBottom: 4 },
  approvedSection: { backgroundColor: '#EEF5EF', paddingBottom: 8, marginBottom: 4 },
  applicantCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  approvedCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  applicantName: { fontWeight: '600', fontSize: 14, color: '#1A1A1A' },
  applicantEmail: { fontSize: 12, color: '#8A93A6', marginTop: 1 },
  applicantNote: { fontSize: 13, color: '#5A6478', marginTop: 6, fontStyle: 'italic' },
  applicantActions: { flexDirection: 'row', marginTop: 10, gap: 8 },
  approveButton: { backgroundColor: '#1E7D45', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  approveButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  rejectButton: { backgroundColor: '#E9ECF3', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  rejectButtonText: { color: '#5A6478', fontWeight: '600', fontSize: 13 },
  revokeButton: { backgroundColor: '#F4D8D8', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  revokeButtonText: { color: '#B00020', fontWeight: '600', fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  type: { fontWeight: '700', color: '#E4002B', fontSize: 12, textTransform: 'uppercase' },
  sender: { fontSize: 12, color: '#8A93A6' },
  content: { fontSize: 15, color: '#1A1A1A', lineHeight: 20 },
  attachmentNote: { marginTop: 8, fontSize: 12, color: '#4A6FA5' },
  composeButton: {
    backgroundColor: '#0B1F3A',
    margin: 16,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  composeButtonText: { color: '#fff', fontWeight: '600' },
});
