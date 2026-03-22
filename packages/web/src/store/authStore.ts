import { create } from 'zustand';
import { IUser } from '@jingles/shared';
import { authApi } from '../api/client';
import { branding } from '../config/branding';

interface AuthState {
	user: IUser | null;
	token: string | null;
	isLoading: boolean;
	error: string | null;
	login: (email: string, password: string) => Promise<void>;
	logout: () => void;
	loadUser: () => Promise<void>;
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
			const { token, user } = responseData;
			localStorage.setItem(branding.tokenStorageKey, token);
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
		set({ user: null, token: null });
	},

	loadUser: async () => {
		const token = localStorage.getItem(branding.tokenStorageKey);
		if (!token) return;
		set({ isLoading: true });
		try {
			const res = await authApi.me();
			// Handle potential response structure variations
			const user = res.data?.data ?? res.data;
			set({ user, isLoading: false });
		} catch {
			localStorage.removeItem(branding.tokenStorageKey);
			set({ user: null, token: null, isLoading: false });
		}
	},
}));
