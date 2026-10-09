import { isPlatformHost, isPlatformRoot } from './platformHost';
export function bookingLink(origin: string, tenantId: string): string {
  const url = new URL('/', origin);
  if (!isPlatformHost(url.hostname) || isPlatformRoot(url.hostname)) url.searchParams.set('tenant', tenantId);
  return url.toString();
}

export async function changePasswordWithVerification(current: string, next: string, confirmation: string,
  actions: { reauthenticate: (password: string) => Promise<unknown>; update: (password: string) => Promise<unknown> }) {
  if (!current) throw new Error('יש להזין את הסיסמה הנוכחית');
  if (next.length < 6) throw new Error('הסיסמה החדשה צריכה להכיל לפחות 6 תווים');
  if (next !== confirmation) throw new Error('הסיסמאות החדשות אינן תואמות');
  if (current === next) throw new Error('יש לבחור סיסמה שונה מהסיסמה הנוכחית');
  await actions.reauthenticate(current);
  await actions.update(next);
}

export function accountError(error: unknown): string {
  const code = (error as {code?: string})?.code;
  if (['auth/invalid-credential', 'auth/wrong-password'].includes(code || '')) return 'הסיסמה הנוכחית אינה נכונה';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return 'הסיסמה אינה עומדת בדרישות האבטחה. נסו סיסמה ארוכה יותר עם אותיות, מספרים וסימן מיוחד';
  if (code === 'auth/too-many-requests') return 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד מספר דקות';
  if (code === 'auth/network-request-failed') return 'אין חיבור לרשת. בדקו את החיבור ונסו שוב';
  if (code === 'auth/invalid-email') return 'יש להזין כתובת אימייל תקינה';
  if (['auth/requires-recent-login', 'auth/user-token-expired', 'auth/user-disabled'].includes(code || '')) return 'יש להתחבר מחדש כדי לבצע את הפעולה';
  if (code) return 'לא ניתן להשלים את הפעולה כרגע. נסו שוב מאוחר יותר';
  return error instanceof Error ? error.message : 'הפעולה נכשלה. נסו שוב';
}
