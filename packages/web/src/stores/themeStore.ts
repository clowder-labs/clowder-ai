import { create } from 'zustand';

export type ThemeType = 'default' | 'business';

const THEME_STORAGE_KEY = 'clowder-ai-theme';

interface ThemeStore {
  theme: ThemeType;
  isLoaded: boolean;
  setTheme: (theme: ThemeType) => void;
  toggleTheme: () => void;
  initializeTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'default',
  isLoaded: false,

  setTheme: (newTheme: ThemeType) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    set({ theme: newTheme });
  },

  toggleTheme: () => {
    const { theme } = get();
    const newTheme = theme === 'default' ? 'business' : 'default';
    get().setTheme(newTheme);
  },

  initializeTheme: () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeType | null;
    const theme = savedTheme === 'default' || savedTheme === 'business' ? savedTheme : 'default';
    set({ theme, isLoaded: true });
  },
}));
