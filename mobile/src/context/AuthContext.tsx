import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { api } from '../services/api';
import { disconnectSocket } from '../services/socket';

type User = { id: string; name: string; email: string; role: string };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role: 'STUDENT' | 'LECTURER') => Promise<void>;
  loginWithBiometrics: () => Promise<boolean>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On app start, check if we already have a stored session
    (async () => {
      const storedUser = await SecureStore.getItemAsync('user');
      if (storedUser) setUser(JSON.parse(storedUser));
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    await SecureStore.setItemAsync('accessToken', data.accessToken);
    await SecureStore.setItemAsync('refreshToken', data.refreshToken);
    await SecureStore.setItemAsync('user', JSON.stringify(data.user));
    setUser(data.user);
  };

  // Once a user has logged in with password once, allow Face ID/fingerprint
  // to unlock the already-stored session on future app opens
  const loginWithBiometrics = async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Campus Connect',
    });

    if (result.success) {
      const storedUser = await SecureStore.getItemAsync('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
        return true;
      }
    }
    return false;
  };

  // Signup returns the created user but not a session (matching the backend,
  // which doesn't auto-login on signup -- a lecturer isn't verified yet and
  // shouldn't get a token). We call login right after for students, whose
  // accounts are usable immediately; lecturers will hit the "pending
  // verification" error from the backend until an admin approves them.
  const signup = async (
    name: string,
    email: string,
    password: string,
    role: 'STUDENT' | 'LECTURER',
  ) => {
    await api.post('/auth/signup', { name, email, password, role });
    if (role === 'STUDENT') {
      await login(email, password);
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');
    disconnectSocket();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, loginWithBiometrics, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
