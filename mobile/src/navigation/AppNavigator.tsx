import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useGlobalReminders } from '../hooks/useGlobalReminders';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import DashboardScreen from '../screens/DashboardScreen';
import BrowseCoursesScreen from '../screens/BrowseCoursesScreen';
import AnnouncementsScreen from '../screens/AnnouncementsScreen';
import RepresentativeApplyScreen from '../screens/RepresentativeApplyScreen';
import LecturerDashboardScreen from '../screens/LecturerDashboardScreen';
import LecturerCourseScreen from '../screens/LecturerCourseScreen';
import ComposeAnnouncementScreen from '../screens/ComposeAnnouncementScreen';

const Stack = createNativeStackNavigator();

function StudentStack() {
  return (
    <>
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="BrowseCourses"
        component={BrowseCoursesScreen}
        options={{ title: 'Browse Courses' }}
      />
      <Stack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={({ route, navigation }: any) => ({
          title: route.params?.courseLabel ? `${route.params.courseLabel} Announcements` : 'Announcements',
          headerRight: () => (
            <Text
              style={{ color: '#0B1F3A', fontWeight: '600' }}
              onPress={() =>
                navigation.navigate('RepresentativeApply', {
                  courseOfferingId: route.params?.courseOfferingId,
                  courseLabel: route.params?.courseLabel,
                })
              }
            >
              Rep Status
            </Text>
          ),
        })}
      />
      <Stack.Screen
        name="RepresentativeApply"
        component={RepresentativeApplyScreen}
        options={{ title: 'Course Representative' }}
      />
    </>
  );
}

function LecturerStack() {
  return (
    <>
      <Stack.Screen
        name="LecturerDashboard"
        component={LecturerDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LecturerCourse"
        component={LecturerCourseScreen}
        options={({ route }: any) => ({
          title: route.params?.courseLabel || 'Course',
        })}
      />
      <Stack.Screen
        name="ComposeAnnouncement"
        component={ComposeAnnouncementScreen}
        options={{ title: 'New Announcement' }}
      />
    </>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null; // could render a splash screen here

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          user.role === 'LECTURER' ? (
            LecturerStack()
          ) : (
            StudentStack()
          )
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
