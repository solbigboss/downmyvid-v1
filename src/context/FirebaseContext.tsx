import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db, loginWithGoogle, logoutUser, handleFirestoreError, OperationType } from '../firebase';
import { DownloadHistoryItem } from '../types';

interface FirebaseContextType {
  currentUser: User | null;
  authLoading: boolean;
  cloudHistory: DownloadHistoryItem[];
  saveToCloudHistory: (item: DownloadHistoryItem) => Promise<void>;
  removeFromCloudHistory: (id: string) => Promise<void>;
  clearCloudHistory: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudHistory, setCloudHistory] = useState<DownloadHistoryItem[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen for user downloads when authenticated
  useEffect(() => {
    if (!currentUser) {
      setCloudHistory([]);
      return;
    }

    const path = `users/${currentUser.uid}/downloads`;
    const q = query(collection(db, path), orderBy('downloadedAt', 'desc'), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: DownloadHistoryItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push(docSnap.data() as DownloadHistoryItem);
        });
        setCloudHistory(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const saveToCloudHistory = async (item: DownloadHistoryItem) => {
    if (!currentUser) return;
    const path = `users/${currentUser.uid}/downloads`;
    try {
      const docRef = doc(db, path, item.id);
      await setDoc(docRef, {
        ...item,
        userId: currentUser.uid,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const removeFromCloudHistory = async (id: string) => {
    if (!currentUser) return;
    const path = `users/${currentUser.uid}/downloads/${id}`;
    try {
      await deleteDoc(doc(db, `users/${currentUser.uid}/downloads`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const clearCloudHistory = async () => {
    if (!currentUser) return;
    const promises = cloudHistory.map((item) => removeFromCloudHistory(item.id));
    await Promise.all(promises);
  };

  const signIn = async () => {
    await loginWithGoogle();
  };

  const signOut = async () => {
    await logoutUser();
  };

  return (
    <FirebaseContext.Provider
      value={{
        currentUser,
        authLoading,
        cloudHistory,
        saveToCloudHistory,
        removeFromCloudHistory,
        clearCloudHistory,
        signIn,
        signOut,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
