import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { AuthContext, type AuthContextValue } from './AuthContext';
import type { AppUserProfile, AuthGateStatus } from './types';

async function loadOrRegisterProfile(user: User): Promise<AppUserProfile> {
  if (!db) throw new Error('Firestore nicht konfiguriert');

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as AppUserProfile;
  }

  const profile: AppUserProfile = {
    email: user.email ?? '',
    displayName: user.displayName ?? undefined,
    photoURL: user.photoURL ?? undefined,
    activated: false,
    createdAt: { seconds: Math.floor(Date.now() / 1000) },
  };

  await setDoc(ref, {
    ...profile,
    createdAt: serverTimestamp(),
  });

  return profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [status, setStatus] = useState<AuthGateStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await loadOrRegisterProfile(user);
    setProfile(p);
    setStatus(p.activated ? 'activated' : 'pending_activation');
  }, [user]);

  useEffect(() => {
    if (!auth) {
      setStatus('anonymous');
      setError('Firebase Auth nicht konfiguriert');
      return;
    }

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null);
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setStatus('anonymous');
        return;
      }

      setUser(firebaseUser);
      try {
        const p = await loadOrRegisterProfile(firebaseUser);
        setProfile(p);
        setStatus(p.activated ? 'activated' : 'pending_activation');
      } catch (e) {
        setProfile(null);
        setStatus('anonymous');
        setError(e instanceof Error ? e.message : 'Profil konnte nicht geladen werden');
        await firebaseSignOut(auth);
        setUser(null);
      }
    });

    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) throw new Error('Firebase Auth nicht konfiguriert');
    setError(null);
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      status,
      error,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [user, profile, status, error, signInWithGoogle, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
