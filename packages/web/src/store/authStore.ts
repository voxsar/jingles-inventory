import { create } from 'zustand';
import type { IUser } from '@jingles/shared';
import { authApi } from '../api/client';
import { branding } from '../config/branding';
import { clearDesktopAuthCache, persistDesktopAuthCache } from '../utils/runtime';

const LAST_ACTIVITY_STORAGE_KEY = 'jingles-inventory-last-activity-at';

interface AuthState {
	user: (IUser & { hasPin?: boolean }) | null;
	token: string | null;
	isLoading: boolean;
	error: string | null;
	login: (email: string, password: string) => Promise<void>;
	logout: () => void;
	loadUser: () => Promise<void>;
	unlock: (pin: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
	user: null,
	token: localStorage.getItem(branding.tokenStorageKey),
	isLoading: false,
	error: null,

	login: async (email, password) => {
		set({ isLoading: true, error: null });
		try {
			const res = await authApi.login(email, password);
			// Handle potential response structure variations
			const responseData = res.data?.data ?? res.data;
			const { token, user, syncToken } = responseData;
			localStorage.setItem(branding.tokenStorageKey, token);
			localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
			persistDesktopAuthCache(token, user, syncToken);
			set({ token, user, isLoading: false });
		} catch (err: any) {
			set({
				error: err.response?.data?.error ?? 'Login failed',
				isLoading: false,
			});
			throw err;
		}
	},

	logout: () => {
		localStorage.removeItem(branding.tokenStorageKey);
		localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
		clearDesktopAuthCache();
		set({ user: null, token: null });
	},

	unlock: async (pin) => {
		await authApi.unlock(pin);
	},

	loadUser: async () => {
		const token = localStorage.getItem(branding.tokenStorageKey);
		if (!token) return;
		set({ isLoading: true });
		try {
			const res = await authApi.me();
			// Handle potential response structure variations
			const user = res.data?.data ?? res.data;
			persistDesktopAuthCache(token, user);
			set({ user, isLoading: false });
		} catch {
			localStorage.removeItem(branding.tokenStorageKey);
			clearDesktopAuthCache();
			set({ user: null, token: null, isLoading: false });
		}
	},
}));
