import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Set EXPO_PUBLIC_API_BASE_URL in a .env file (loaded automatically by Expo)
// so testers' builds point at your live Railway backend without hardcoding it.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://your-backend-domain.com';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, try a single refresh, then retry the original request once
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
          await SecureStore.setItemAsync('accessToken', data.accessToken);
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        } catch {
          // Refresh failed -- clear tokens, caller should route to login
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('refreshToken');
        }
      }
    }
    return Promise.reject(error);
  },
);
