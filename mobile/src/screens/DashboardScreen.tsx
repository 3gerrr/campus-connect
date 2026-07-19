import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

type Enrollment = {
  id: string;
  courseOffering: {
    id: string;
    course: { code: string; title: string; department: { name: string; faculty: { name: string } } };
    academicSession: { name: string };
    lecturer: { name: string };
  };
};

export default function DashboardScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<Enrollment[]>({
    queryKey: ['my-enrollments'],
    queryFn: async () => (await api.get('/enrollment')).data,
  });

  const handleLogout = async () => {
    await logout();
    // Clear any cached data tied to the previous account so a different
    // user logging in on the same device never sees stale course data.
    queryClient.clear();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {user?.name?.split(' ')[0]}</Text>
          <Text style={styles.subGreeting}>Your enrolled courses</Text>
        </View>
        <Pressable onPress={handleLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Text style={styles.stateText}>Loading your courses...</Text>
      ) : isError ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>Couldn't load your courses.</Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : data && data.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>You're not enrolled in any courses yet.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          renderItem={({ item }) => {
            const { courseOffering } = item;
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  navigation.navigate('Announcements', {
                    courseOfferingId: courseOffering.id,
                    courseLabel: courseOffering.course.code,
                  })
                }
              >
                <Text style={styles.courseCode}>{courseOffering.course.code}</Text>
                <Text style={styles.courseTitle}>{courseOffering.course.title}</Text>
                <Text style={styles.courseMeta}>
                  {courseOffering.course.department.faculty.name} · {courseOffering.course.department.name}
                </Text>
                <Text style={styles.courseMeta}>
                  {courseOffering.lecturer.name} · {courseOffering.academicSession.name}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable style={styles.browseButton} onPress={() => navigation.navigate('BrowseCourses')}>
        <Text style={styles.browseButtonText}>Browse Courses to Enroll</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#0B1F3A',
  },
  greeting: { fontSize: 20, fontWeight: '700', color: '#fff' },
  subGreeting: { fontSize: 13, color: '#9FB3D9', marginTop: 2 },
  logoutText: { color: '#FF8080', fontSize: 14 },
  stateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  stateText: { textAlign: 'center', marginTop: 40, color: '#5A6478' },
  retryButton: { marginTop: 12, backgroundColor: '#E4002B', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { color: '#fff', fontWeight: '600' },
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
  courseCode: { fontWeight: '700', fontSize: 12, color: '#E4002B', textTransform: 'uppercase' },
  courseTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginTop: 2 },
  courseMeta: { fontSize: 12, color: '#8A93A6', marginTop: 4 },
  browseButton: {
    backgroundColor: '#0B1F3A',
    margin: 16,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  browseButtonText: { color: '#fff', fontWeight: '600' },
});
