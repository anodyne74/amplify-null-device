/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { captureRouteRequest, type SesReceiptRecord } from './routeRequestCapture';

const raw = readFileSync(join(__dirname, '__fixtures__', 'route-requests', 'two-attachments.eml'));

function sesRecord(recipients: string[], dkim = 'PASS'): SesReceiptRecord {
  return {
    ses: {
      mail: { messageId: 'ses-msg-1', timestamp: '2026-09-27T23:16:02.000Z' },
      receipt: {
        recipients,
        spfVerdict: { status: 'PASS' },
        dkimVerdict: { status: dkim },
        dmarcVerdict: { status: 'PASS' },
      },
    },
  };
}

function fakes(existing: object | null = null) {
  const create = jest.fn().mockResolvedValue({ data: {}, errors: null });
  const deps = {
    ownDomain: 'nulldevice.dev',
    readRawMessage: jest.fn().mockResolvedValue(raw),
    putFile: jest.fn().mockResolvedValue(undefined),
    client: {
      models: {
        RouteRequestEmail: { get: jest.fn().mockResolvedValue({ data: existing, errors: null }), create },
        CustomerUser: {
          list: jest.fn().mockResolvedValue({
            data: [{ customerId: 'c1', email: 'owner@harcourts.com.au' }],
            errors: null,
            nextToken: null,
          }),
        },
      },
    },
  };
  return { deps, create };
}

describe('captureRouteRequest', () => {
  it('stores every attachment and creates an Unlinked record keyed by the SES message ID, with a suggested Customer', async () => {
    const { deps, create } = fakes();

    await expect(captureRouteRequest(sesRecord(['requests@nulldevice.dev']), deps)).resolves.toBe('captured');

    expect(deps.readRawMessage).toHaveBeenCalledWith('ses-msg-1');
    expect(deps.putFile.mock.calls.map(([key, bytes, type]) => [key, bytes.byteLength, type])).toEqual([
      ['requests/ses-msg-1/0-logo.png', 8, 'image/png'],
      ['requests/ses-msg-1/1-Tuesday schedule.pdf', 15, 'application/pdf'],
      ['requests/ses-msg-1/2-properties.xlsx', 5, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ses-msg-1',
        status: 'unlinked',
        fromAddress: 'ann.agent@harcourts.com.au',
        rawMessageKey: 'ses-msg-1',
        suggestedCustomerId: 'c1',
        loggedByStaff: false,
        attachments: [
          { key: 'requests/ses-msg-1/0-logo.png', filename: 'logo.png', contentType: 'image/png', size: 8, inline: true },
          {
            key: 'requests/ses-msg-1/1-Tuesday schedule.pdf',
            filename: 'Tuesday schedule.pdf',
            contentType: 'application/pdf',
            size: 15,
            inline: false,
          },
          {
            key: 'requests/ses-msg-1/2-properties.xlsx',
            filename: 'properties.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 5,
            inline: false,
          },
        ],
      })
    );
  });

  it("passes SES's verdicts through", async () => {
    const { deps, create } = fakes();

    await captureRouteRequest(sesRecord(['requests@nulldevice.dev'], 'FAIL'), deps);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ spfVerdict: 'PASS', dkimVerdict: 'FAIL', dmarcVerdict: 'PASS' }));
  });

  it('ignores mail not addressed to requests@ -- the forward handles that alone', async () => {
    const { deps, create } = fakes();

    await expect(captureRouteRequest(sesRecord(['support@nulldevice.dev']), deps)).resolves.toBe('not-a-request');

    expect(deps.readRawMessage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('captures mail sent to requests@ alongside another address, ignoring case', async () => {
    const { deps } = fakes();

    await expect(captureRouteRequest(sesRecord(['support@nulldevice.dev', 'Requests@NullDevice.dev']), deps)).resolves.toBe(
      'captured'
    );
  });

  it('does nothing for a message it has already captured, so a retried delivery makes no duplicate', async () => {
    const { deps, create } = fakes({ id: 'ses-msg-1' });

    await expect(captureRouteRequest(sesRecord(['requests@nulldevice.dev']), deps)).resolves.toBe('already-captured');

    expect(deps.putFile).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('still captures without a suggestion when Customer Users cannot be listed', async () => {
    const { deps, create } = fakes();
    deps.client.models.CustomerUser.list.mockResolvedValue({ data: [], errors: [{ message: 'boom' }], nextToken: null });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await captureRouteRequest(sesRecord(['requests@nulldevice.dev']), deps);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ suggestedCustomerId: null }));
  });

  it('fails, so Lambda retries it, when a file cannot be stored or the record cannot be created', async () => {
    const storeFails = fakes();
    storeFails.deps.putFile.mockRejectedValueOnce(new Error('s3 down'));
    await expect(captureRouteRequest(sesRecord(['requests@nulldevice.dev']), storeFails.deps)).rejects.toThrow('s3 down');
    expect(storeFails.create).not.toHaveBeenCalled();

    const createFails = fakes();
    createFails.create.mockResolvedValue({ data: null, errors: [{ message: 'nope' }] });
    await expect(captureRouteRequest(sesRecord(['requests@nulldevice.dev']), createFails.deps)).rejects.toThrow(
      /Could not create/
    );
  });
});
