export type AppThemeMode = 'light' | 'dark';

export interface AppUser {
  id: string;
  email?: string;
  role?: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export * from './models';
