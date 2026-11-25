import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore/lite';

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyBizOj0qZjtN1bZcfoi9srYbTZUkfWzMto',
  appId: '1:863525850870:web:311df0ce1749a68925a6d7',
  authDomain: 'my-first-app-r-d.firebaseapp.com',
  messagingSenderId: '863525850870',
  projectId: 'my-first-app-r-d',
  storageBucket: 'my-first-app-r-d.firebasestorage.app',
});

export const firestore = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}