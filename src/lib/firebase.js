import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// Firebase web config values are not secret (see Firebase docs) — safe to
// commit. Access control is enforced by Firestore security rules and the
// Auth provider's authorized-domains list, not by hiding this object.
const firebaseConfig = {
  apiKey: 'AIzaSyD_-mALger3hU2_hsu1lA_nEMsBD0epSOo',
  authDomain: 'exercise-tracker-26120.firebaseapp.com',
  projectId: 'exercise-tracker-26120',
  storageBucket: 'exercise-tracker-26120.firebasestorage.app',
  messagingSenderId: '372462449667',
  appId: '1:372462449667:web:deb792917e23d4f02e0a36',
};

// This staging app reuses the exercise-tracker Firebase project (same as
// production Packliste) but keeps its OWN separate named Firestore
// database ("packliste-stripe"), distinct from both production's
// "packliste" database and the project's default one — so this pilot's
// rules/data can never collide with or overwrite production's.
const DATABASE_ID = 'packliste-stripe';

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  },
  DATABASE_ID
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const functions = getFunctions(app);
