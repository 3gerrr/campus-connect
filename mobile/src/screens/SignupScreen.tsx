import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

type Role = 'STUDENT' | 'LECTURER';

export default function SignupScreen({ navigation }: any) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('STUDENT');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Shown after a successful lecturer signup, since there's no session yet
  const [pendingVerification, setPendingVerification] = useState(false);

  const handleSignup = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signup(name, email, password, role);
      if (role === 'LECTURER') {
        setPendingVerification(true);
      }
      // Students are logged in automatically by signup() -- AppNavigator
      // will switch them to the main app once `user` is set.
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Signup failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Account created</Text>
        <Text style={styles.pendingText}>
          Your lecturer account is pending verification by your university
          administrator. You'll be able to log in once approved.
        </Text>
        <Pressable style={styles.button} onPress={() => navigation.replace('Login')}>
          <Text style={styles.buttonText}>Back to Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <View style={styles.roleToggle}>
        <Pressable
          style={[styles.roleButton, role === 'STUDENT' && styles.roleButtonActive]}
          onPress={() => setRole('STUDENT')}
        >
          <Text style={[styles.roleText, role === 'STUDENT' && styles.roleTextActive]}>
            Student
          </Text>
        </Pressable>
        <Pressable
          style={[styles.roleButton, role === 'LECTURER' && styles.roleButtonActive]}
          onPress={() => setRole('LECTURER')}
        >
          <Text style={[styles.roleText, role === 'LECTURER' && styles.roleTextActive]}>
            Lecturer
          </Text>
        </Pressable>
      </View>

      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="University email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {role === 'LECTURER' && (
        <Text style={styles.hint}>
          Lecturer accounts require approval from your university administrator
          before you can log in.
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleSignup} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create Account</Text>
        )}
      </Pressable>

      <Pressable style={styles.linkButton} onPress={() => navigation.replace('Login')}>
        <Text style={styles.linkText}>Already have an account? Log in</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0B1F3A' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 24, textAlign: 'center' },
  roleToggle: { flexDirection: 'row', marginBottom: 20, borderRadius: 8, overflow: 'hidden' },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#132C52',
  },
  roleButtonActive: { backgroundColor: '#E4002B' },
  roleText: { color: '#9FB3D9', fontWeight: '600' },
  roleTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  hint: { color: '#9FB3D9', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  button: {
    backgroundColor: '#E4002B',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  linkButton: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#9FB3D9' },
  error: { color: '#FF8080', marginBottom: 8, textAlign: 'center' },
  pendingText: { color: '#D7E2F5', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
});
