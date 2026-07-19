import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

type Application = {
  id: string;
  type: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  applicationNote: string | null;
} | null;

const STATUS_COPY: Record<string, { label: string; color: string; description: string }> = {
  PENDING: {
    label: 'Pending',
    color: '#B8860B',
    description: 'Your application is waiting for your lecturer to review it.',
  },
  APPROVED: {
    label: 'Approved',
    color: '#1E7D45',
    description: "You're an approved representative for this course.",
  },
  REJECTED: {
    label: 'Rejected',
    color: '#B00020',
    description: 'Your application was not approved. You can apply again below.',
  },
  REVOKED: {
    label: 'Revoked',
    color: '#B00020',
    description: 'Your representative status was revoked. You can apply again below.',
  },
};

export default function RepresentativeApplyScreen({ route }: any) {
  const { courseOfferingId, courseLabel } = route.params;
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery<Application>({
    queryKey: ['my-rep-application', courseOfferingId],
    queryFn: async () => (await api.get(`/representatives/mine/${courseOfferingId}`)).data,
  });

  const applyMutation = useMutation({
    mutationFn: () => api.post('/representatives/apply', { courseOfferingId, applicationNote: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-rep-application', courseOfferingId] });
      setNote('');
    },
    onError: (err: any) => {
      Alert.alert('Could not submit application', err?.response?.data?.message || 'Please try again.');
    },
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  // No application yet, or a previous one was rejected/revoked -- either way
  // the form should be available to (re)apply.
  const canApply = !data || data.status === 'REJECTED' || data.status === 'REVOKED';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{courseLabel} Representative</Text>

      {data && (
        <View style={[styles.statusCard, { borderLeftColor: STATUS_COPY[data.status].color }]}>
          <Text style={[styles.statusLabel, { color: STATUS_COPY[data.status].color }]}>
            {STATUS_COPY[data.status].label}
          </Text>
          <Text style={styles.statusDescription}>{STATUS_COPY[data.status].description}</Text>
          {data.applicationNote ? (
            <Text style={styles.previousNote}>Your note: "{data.applicationNote}"</Text>
          ) : null}
        </View>
      )}

      {canApply && (
        <>
          <Text style={styles.label}>
            Why would you make a good representative? (optional)
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder="A short note for your lecturer..."
            multiline
            numberOfLines={4}
            value={note}
            onChangeText={setNote}
          />
          <Pressable
            style={[styles.submitButton, applyMutation.isPending && styles.submitButtonDisabled]}
            onPress={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {data ? 'Apply Again' : 'Apply to be a Representative'}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA', padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6FA' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    marginBottom: 20,
  },
  statusLabel: { fontWeight: '700', fontSize: 14, textTransform: 'uppercase' },
  statusDescription: { fontSize: 13, color: '#5A6478', marginTop: 4, lineHeight: 18 },
  previousNote: { fontSize: 13, color: '#8A93A6', marginTop: 8, fontStyle: 'italic' },
  label: { fontSize: 13, fontWeight: '600', color: '#5A6478', marginBottom: 8 },
  textArea: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#0B1F3A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
