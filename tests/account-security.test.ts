import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingLink, changePasswordWithVerification, accountError } from '../src/utils/accountSecurity';

test('booking links target the selected tenant and discard admin paths and unrelated query values', () => {
  const a = new URL(bookingLink('https://example.com/admin?tenant=alex&secret=private', 'avi'));
  assert.equal(a.pathname, '/');
  assert.equal(a.searchParams.get('tenant'), 'avi');
  assert.equal(a.searchParams.has('secret'), false);
  assert.notEqual(bookingLink(a.origin, 'alex'), bookingLink(a.origin, 'avi'));
});

test('password update requires successful current-password authentication first', async () => {
  const calls: string[] = [];
  await assert.rejects(changePasswordWithVerification('wrong', 'new-pass-123', 'new-pass-123', {
    reauthenticate: async () => { calls.push('verify'); throw new Error('wrong password'); },
    update: async () => { calls.push('update'); },
  }));
  assert.deepEqual(calls, ['verify']);
  calls.length = 0;
  await changePasswordWithVerification('old-pass', 'new-pass-123', 'new-pass-123', {
    reauthenticate: async password => { assert.equal(password, 'old-pass'); calls.push('verify'); },
    update: async password => { assert.equal(password, 'new-pass-123'); calls.push('update'); },
  });
  assert.deepEqual(calls, ['verify', 'update']);
});

test('invalid password form never reaches authentication or update', async () => {
  for (const [current, next, confirmation] of [['', 'abc123', 'abc123'], ['old', '123', '123'], ['old', 'abcdef', 'different'], ['abcdef', 'abcdef', 'abcdef']]) {
    await assert.rejects(changePasswordWithVerification(current, next, confirmation, {
      reauthenticate: async () => assert.fail('unexpected auth'), update: async () => assert.fail('unexpected update'),
    }));
  }
});

test('provider errors do not expose raw technical messages', () => {
  assert.equal(accountError({code: 'auth/wrong-password', message: 'secret'}), 'הסיסמה הנוכחית אינה נכונה');
  assert.equal(accountError({code: 'auth/unknown', message: 'secret'}).includes('secret'), false);
});
