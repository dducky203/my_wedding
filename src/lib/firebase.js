import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBlGD5vFK0HJpjPg42-BYb-iQvFjmdIGE',
  authDomain: 'my-wedding-28f9d.firebaseapp.com',
  projectId: 'my-wedding-28f9d',
  storageBucket: 'my-wedding-28f9d.firebasestorage.app',
  messagingSenderId: '394165455946',
  appId: '1:394165455946:web:5102db45fa176b8c3b6ab3',
  measurementId: 'G-KPN7YCWZ2X',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
