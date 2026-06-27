import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const CONNECTIONS_COLLECTION =
  process.env.NEXT_PUBLIC_FIREBASE_DB_COLLECTION || "connections";

// Firebase touches browser-only APIs, so we lazily initialise on the client only.
let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

export function getFirebase() {
  if (typeof window === "undefined") {
    return { app: null, db: null, auth: null };
  }
  if (!_app) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _db = getFirestore(_app);
    _auth = getAuth(_app);
  }
  return { app: _app, db: _db as Firestore, auth: _auth as Auth };
}
