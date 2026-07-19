import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator, RefreshControl, Share, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useCourseRealtime } from '../hooks/useCourseRealtime';
import { useVerifyChain } from '../hooks/useVerifyChain';

type Announcement = {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
  sender: { name: string; role: string };
  attachments: { id: string; url: string; fileName: string; fileType: string }[];
  shares: { sharedById: string; createdAt: string }[];
};

export default function AnnouncementsScreen({ route, navigation }: any) {
  const { courseOfferingId } = route.params;

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<Announcement[]>({
    queryKey: ['announcements', courseOfferingId],
    queryFn: async () => (await api.get(`/announcements/offering/${courseOfferingId}`)).data,
    // If this errors with 403 (e.g. dropped from another device since this
    // screen was opened), retrying won't help -- don't burn requests on it.
    retry: (failureCount, err: any) => err?.response?.status !== 403 && failureCount < 2,
  });

  // Live updates: new/shared announcements for this course refresh the list
  // automatically without needing a manual pull-to-refresh.
  useCourseRealtime(courseOfferingId, ['announcements', courseOfferingId]);

  const verifyChain = useVerifyChain(courseOfferingId);

  // Fetches a small, portable cryptographic proof that THIS SPECIFIC
  // announcement is included in the course's official history, and hands
  // it to the OS share sheet -- so a student can save/export/send it
  // somewhere outside the app entirely. Unlike the "Verify" button (which
  // checks against the live API), this proof is self-contained: whoever
  // receives it can verify it later without needing access to this app or
  // this course at all, as long as they trust where the root hash came from.
  const handleExportProof = async (announcementId: string) => {
    try {
      const { data: proof } = await api.get(
        `/announcements/offering/${courseOfferingId}/inclusion-proof/${announcementId}`,
      );
      await Share.share({
        title: 'Announcement Proof of Inclusion',
        message:
          `Cryptographic proof that this announcement is part of the official, ` +
          `tamper-evident course record.\n\n${JSON.stringify(proof, null, 2)}`,
      });
    } catch (e) {
      Alert.alert('Could not generate proof', 'Please try again.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    const status = (error as any)?.response?.status;
    const isForbidden = status === 403;
    return (
      <View style={styles.centered}>
        <Text style={styles.stateText}>
          {isForbidden
            ? "You're no longer enrolled in this course."
            : "Couldn't load announcements."}
        </Text>
        {isForbidden ? (
          <Pressable style={styles.retryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.retryText}>Back to Dashboard</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const verifyRow = (
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
  );

  if (data && data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateText}>No announcements yet for this course.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={data}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={verifyRow}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.type}>{item.category.replace('_', ' ')}</Text>
            <Text style={styles.sender}>{item.sender.name} · {item.sender.role}</Text>
          </View>
          <Text style={styles.content}>{item.content}</Text>
          {item.attachments.length > 0 && (
            <Text style={styles.attachmentNote}>
              {item.attachments.length} attachment{item.attachments.length > 1 ? 's' : ''}
            </Text>
          )}
          {item.shares.length > 0 && (
            <Text style={styles.shareNote}>Shared by {item.shares.length} representative(s)</Text>
          )}
          <Pressable onPress={() => handleExportProof(item.id)}>
            <Text style={styles.exportLink}>Export proof of inclusion</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#F4F6FA', flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6FA', padding: 24 },
  stateText: { textAlign: 'center', color: '#5A6478' },
  retryButton: { marginTop: 12, backgroundColor: '#E4002B', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { color: '#fff', fontWeight: '600' },
  verifyRow: {
    backgroundColor: '#EDEFF5',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  verifyText: { fontSize: 12, color: '#5A6478', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
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
  shareNote: { marginTop: 4, fontSize: 12, color: '#8A93A6', fontStyle: 'italic' },
  exportLink: { marginTop: 8, fontSize: 11, color: '#4A6FA5', fontWeight: '600' },
});
