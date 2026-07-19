import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

const CATEGORIES = [
  'GENERAL',
  'CLASS_STARTED',
  'VENUE_CHANGE',
  'CANCELLATION',
  'ASSIGNMENT',
  'EXAM',
  'REMINDER',
  'EMERGENCY',
];

type AttachmentDraft = { url: string; fileName: string; fileType: string };

export default function ComposeAnnouncementScreen({ route, navigation }: any) {
  const { courseOfferingId } = route.params;
  const queryClient = useQueryClient();

  const [category, setCategory] = useState('GENERAL');
  const [content, setContent] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);

  const addAttachment = () => setAttachments((prev) => [...prev, { url: '', fileName: '', fileType: 'link' }]);
  const updateAttachment = (index: number, field: keyof AttachmentDraft, value: string) => {
    setAttachments((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };
  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const postMutation = useMutation({
    mutationFn: () => {
      const validAttachments = attachments.filter((a) => a.url.trim() && a.fileName.trim());
      const expiresAt = expiresInHours
        ? new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000).toISOString()
        : undefined;

      return api.post('/announcements', {
        courseOfferingId,
        category,
        content,
        attachments: validAttachments.length ? validAttachments : undefined,
        expiresAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements', courseOfferingId] });
      navigation.goBack();
    },
    onError: (err: any) => {
      Alert.alert('Could not post announcement', err?.response?.data?.message || 'Please try again.');
    },
  });

  const canSubmit = content.trim().length > 0 && !postMutation.isPending;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>
              {cat.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Message</Text>
      <TextInput
        style={styles.textArea}
        placeholder="What do your students need to know?"
        multiline
        numberOfLines={5}
        value={content}
        onChangeText={setContent}
      />

      <Text style={styles.label}>Expires in (hours, optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 24 -- leave blank for no expiry"
        keyboardType="number-pad"
        value={expiresInHours}
        onChangeText={setExpiresInHours}
      />

      <View style={styles.attachmentsHeader}>
        <Text style={styles.label}>Attachments (optional)</Text>
        <Pressable onPress={addAttachment}>
          <Text style={styles.addLink}>+ Add</Text>
        </Pressable>
      </View>

      {attachments.map((attachment, index) => (
        <View key={index} style={styles.attachmentBlock}>
          <TextInput
            style={styles.input}
            placeholder="File name (e.g. Lecture Slides Week 3)"
            value={attachment.fileName}
            onChangeText={(v) => updateAttachment(index, 'fileName', v)}
          />
          <TextInput
            style={styles.input}
            placeholder="URL (https://...)"
            autoCapitalize="none"
            value={attachment.url}
            onChangeText={(v) => updateAttachment(index, 'url', v)}
          />
          <Pressable onPress={() => removeAttachment(index)}>
            <Text style={styles.removeLink}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={() => postMutation.mutate()}
        disabled={!canSubmit}
      >
        {postMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Post Announcement</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F4F6FA', flexGrow: 1 },
  label: { fontSize: 13, fontWeight: '700', color: '#5A6478', marginBottom: 8, marginTop: 16 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#E9ECF3',
  },
  categoryChipActive: { backgroundColor: '#E4002B' },
  categoryText: { fontSize: 12, color: '#5A6478', fontWeight: '600' },
  categoryTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  attachmentsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addLink: { color: '#0B1F3A', fontWeight: '600', marginTop: 16 },
  attachmentBlock: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  removeLink: { color: '#E4002B', fontSize: 12, marginTop: 2, textAlign: 'right' },
  submitButton: {
    backgroundColor: '#0B1F3A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
