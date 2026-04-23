import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if we have an API key (prevents build crash)
let app: FirebaseApp | null = null;
if (getApps().length) {
  app = getApp();
} else if (firebaseConfig.apiKey) {
  app = initializeApp(firebaseConfig);
} else {
  if (typeof window !== "undefined") {
    console.error("Firebase Client Error: NEXT_PUBLIC_FIREBASE_API_KEY is missing. Check your environment variables.");
  }
}

export const db = app ? getFirestore(app) : null as unknown as Firestore;
export const auth = app ? getAuth(app) : null as unknown as Auth;
export default app;
