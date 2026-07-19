import React, { useMemo } from 'react';
import { View, Text, SectionList, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../services/api';

type CourseOffering = {
  id: string;
  course: {
    code: string;
    title: string;
    department: { name: string; faculty: { name: string } };
  };
  academicSession: { name: string };
  lecturer: { name: string };
};

type Enrollment = {
  courseOffering: { id: string };
};

export default function BrowseCoursesScreen({ navigation }: any) {
  const queryClient = useQueryClient();

  const offeringsQuery = useQuery<CourseOffering[]>({
    queryKey: ['course-offerings'],
    queryFn: async () => (await api.get('/academic/course-offerings')).data,
  });

  const enrollmentsQuery = useQuery<Enrollment[]>({
    queryKey: ['my-enrollments'],
    queryFn: async () => (await api.get('/enrollment')).data,
  });

  // Cross-reference once, not per-row, so re-renders don't re-scan the list
  // for every card -- matters once a university has hundreds of offerings.
  const enrolledIds = useMemo(
    () => new Set(enrollmentsQuery.data?.map((e) => e.courseOffering.id) ?? []),
    [enrollmentsQuery.data],
  );

  const enrollMutation = useMutation({
    mutationFn: (courseOfferingId: string) => api.post('/enrollment', { courseOfferingId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-enrollments'] }),
    onError: (err: any) => {
      Alert.alert('Enrollment failed', err?.response?.data?.message || 'Please try again.');
    },
  });

  const dropMutation = useMutation({
    mutationFn: (courseOfferingId: string) => api.post('/enrollment/drop', { courseOfferingId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-enrollments'] }),
    onError: (err: any) => {
      Alert.alert('Could not drop course', err?.response?.data?.message || 'Please try again.');
    },
  });

  const confirmDrop = (courseOfferingId: string, label: string) => {
    Alert.alert(
      'Drop this course?',
      `You'll stop receiving announcements for ${label}. You can re-enroll later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Drop', style: 'destructive', onPress: () => dropMutation.mutate(courseOfferingId) },
      ],
    );
  };

  // Group flat offerings into Faculty > Department sections for readability
  // -- a raw flat list of "CSC301, MTH201, PHY110..." tells a student nothing
  // about where they are in the institution.
  const sections = useMemo(() => {
    if (!offeringsQuery.data) return [];
    const grouped = new Map<string, CourseOffering[]>();
    for (const offering of offeringsQuery.data) {
      const key = `${offering.course.department.faculty.name} · ${offering.course.department.name}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(offering);
    }
    return Array.from(grouped.entries()).map(([title, data]) => ({ title, data }));
  }, [offeringsQuery.data]);

  if (offeringsQuery.isLoading || enrollmentsQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (offeringsQuery.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateText}>Couldn't load courses.</Text>
        <Pressable style={styles.retryButton} onPress={() => offeringsQuery.refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateText}>No courses have been set up yet.</Text>
      </View>
    );
  }

  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
        const isEnrolled = enrolledIds.has(item.id);
        const label = `${item.course.code} — ${item.course.title}`;
        const isPending =
          (enrollMutation.isPending && enrollMutation.variables === item.id) ||
          (dropMutation.isPending && dropMutation.variables === item.id);

        return (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.courseCode}>{item.course.code}</Text>
              <Text style={styles.courseTitle}>{item.course.title}</Text>
              <Text style={styles.courseMeta}>
                {item.lecturer.name} · {item.academicSession.name}
              </Text>
            </View>

            {isPending ? (
              <ActivityIndicator />
            ) : isEnrolled ? (
              <Pressable style={styles.dropButton} onPress={() => confirmDrop(item.id, label)}>
                <Text style={styles.dropButtonText}>Enrolled</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.enrollButton} onPress={() => enrollMutation.mutate(item.id)}>
                <Text style={styles.enrollButtonText}>Enroll</Text>
              </Pressable>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#F4F6FA', flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6FA', padding: 24 },
  stateText: { color: '#5A6478', textAlign: 'center' },
  retryButton: { marginTop: 12, backgroundColor: '#E4002B', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { color: '#fff', fontWeight: '600' },
  sectionHeader: {
    backgroundColor: '#F4F6FA',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#5A6478',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardInfo: { flex: 1, paddingRight: 12 },
  courseCode: { fontWeight: '700', fontSize: 12, color: '#E4002B', textTransform: 'uppercase' },
  courseTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginTop: 2 },
  courseMeta: { fontSize: 12, color: '#8A93A6', marginTop: 4 },
  enrollButton: { backgroundColor: '#0B1F3A', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  enrollButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  dropButton: { backgroundColor: '#E9ECF3', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  dropButtonText: { color: '#5A6478', fontWeight: '600', fontSize: 13 },
});
