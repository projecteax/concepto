import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Helper function to check if a value is a placeholder
const isPlaceholder = (value: string | undefined): boolean => {
  if (!value) return true;
  return value.includes('your_') || value.includes('your-') || value === '123456789';
};

const firebaseConfig = {
  apiKey: (!isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)) 
    ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY 
    : "AIzaSyAzAZo2TR0RuaeXJvw1zOsUwqgwv79FVVQ",
  authDomain: (!isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)) 
    ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN 
    : "concepto-a214a.firebaseapp.com",
  projectId: (!isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)) 
    ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID 
    : "concepto-a214a",
  storageBucket: (!isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)) 
    ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET 
    : "concepto-a214a.firebasestorage.app",
  messagingSenderId: (!isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)) 
    ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID 
    : "527819922947",
  appId: (!isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)) 
    ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID 
    : "1:527819922947:web:a1c518e2e96746e70eb836",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-PFEE79DWFR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
