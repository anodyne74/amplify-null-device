import { requestAttachmentKey } from './routeRequestKey';

describe('requestAttachmentKey', () => {
  it("keeps files apart by position and makes the name safe for a key", () => {
    expect(requestAttachmentKey('ses-msg-1', 0, 'Tuesday schedule.pdf')).toBe('requests/ses-msg-1/0-Tuesday schedule.pdf');
    expect(requestAttachmentKey('ses-msg-1', 2, '../evil/\\name?.pdf')).toBe('requests/ses-msg-1/2-.._evil__name_.pdf');
  });
});
