import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { auth } from './firebase.js';

export { auth };

const memoryStorage = {};

export function storageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return memoryStorage[key] || null;
  }
}

export function storageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    memoryStorage[key] = value;
  }
}

export function loginAdmin(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function logoutAdmin() {
  return signOut(auth);
}

export async function changeAdminPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}
