import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from './firebase';
import { changePasswordWithVerification } from '../utils/accountSecurity';

export async function changeAdminPassword(current: string, next: string, confirmation: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('יש להתחבר מחדש לחשבון הניהול');
  await changePasswordWithVerification(current, next, confirmation, {
    reauthenticate: password => reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password)),
    update: password => updatePassword(user, password),
  });
}

export async function requestAdminPasswordReset(email: string) {
  const cleanEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('יש להזין כתובת אימייל תקינה');
  auth.languageCode = 'he';
  try { await sendPasswordResetEmail(auth, cleanEmail); }
  catch (error: any) {
    // Keep the same response for unknown addresses to avoid revealing account membership.
    if (error?.code !== 'auth/user-not-found') throw error;
  }
}
