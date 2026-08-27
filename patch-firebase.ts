import { db } from './src/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export async function saveWhatsAppSettingsToFirestore(settings: any) {
  try {
    const docRef = doc(db, 'settings', 'whatsapp_settings');
    await setDoc(docRef, settings, { merge: true });
  } catch (err) {
    console.error('Failed to save WA settings to Firestore', err);
  }
}
