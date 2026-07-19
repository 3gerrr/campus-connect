import React, { useState } from 'react';
import { View, TextInput, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }: any) {
  const { login, loginWithBiometrics } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Campus Connect</Text>

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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleLogin} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
      </Pressable>

      <Pressable style={styles.biometricButton} onPress={loginWithBiometrics}>
        <Text style={styles.biometricText}>Use Face ID / Fingerprint</Text>
      </Pressable>

      <Pressable style={styles.linkButton} onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.linkText}>New here? Create an account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0B1F3A' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 32, textAlign: 'center' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#E4002B',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  biometricButton: { marginTop: 16, alignItems: 'center' },
  biometricText: { color: '#9FB3D9' },
  linkButton: { marginTop: 24, alignItems: 'center' },
  linkText: { color: '#9FB3D9' },
  error: { color: '#FF8080', marginBottom: 8, textAlign: 'center' },
});
