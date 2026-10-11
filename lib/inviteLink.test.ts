import { buildInviteUrl, parseInviteFragment } from './inviteLink';

describe('invite link', () => {
  it('round-trips an email and a password full of reserved characters', () => {
    const url = buildInviteUrl('https://portal.example.com/', 'a+b@example.com', '+b^nU3y&9=Su 26#JD%');
    expect(url.startsWith('https://portal.example.com/#invite&')).toBe(true);
    expect(parseInviteFragment(new URL(url).hash)).toEqual({
      email: 'a+b@example.com',
      temporaryPassword: '+b^nU3y&9=Su 26#JD%',
    });
  });

  it('ignores any other fragment', () => {
    expect(parseInviteFragment('')).toBeNull();
    expect(parseInviteFragment('#section')).toBeNull();
    expect(parseInviteFragment('#invite&email=a@b.com')).toBeNull();
  });
});
