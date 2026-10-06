import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

describe('import-prep', () => {
  it('builds a legacy import bundle from tracker and route-list csv files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-test-'));
    const routeListsDir = path.join(tempDir, 'route-lists');
    fs.mkdirSync(routeListsDir);

    const trackerPath = path.join(tempDir, 'Tracker - Jobs.csv');
    const routeListPath = path.join(routeListsDir, 'W23-26-001 - Route List - Route.csv');
    const outputPath = path.join(tempDir, 'bundle.json');

    fs.writeFileSync(
      trackerPath,
      [
        'RouteID,Job,Signs,Stops,Kilometers,Invoice,Hours,Rate,Amount,Sent,Paid,CalculatedTotal',
        'W23-26-001,Sample route,12,2,18.5,INV-001,1:30,$75.00,$112.50,2024-07-01,2024-07-10,999',
      ].join('\n')
    );

    fs.writeFileSync(
      routeListPath,
      [
        'Sequence,Address,Notes,Signs',
        '1,10 Example Street,,6',
        '2,20 Example Street,,6',
        'Total,,,12',
      ].join('\n')
    );

    execFileSync(
      'node',
      [
        path.join(process.cwd(), 'scripts/import-prep.js'),
        '--tracker', trackerPath,
        '--route-lists-dir', routeListsDir,
        '--customer-id', 'cust-1',
        '--mode', 'dry-run',
        '--output', outputPath,
      ],
      { stdio: 'pipe' }
    );

    const bundle = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(bundle.schemaVersion).toBe('1.0');
    expect(bundle.mode).toBe('dry-run');
    expect(bundle.stats).toEqual({
      trackerRows: 1,
      routeListFilesMatched: 1,
      routesPrepared: 1,
      invoicesPrepared: 1,
      stopsPrepared: 2,
      payoutsPrepared: 0,
      warnings: 0,
    });
    expect(bundle.records).toHaveLength(1);
    expect(bundle.records[0]).toMatchObject({
      customerId: 'cust-1',
      importKey: 'W23-26-001::INV-001',
      route: {
        routeCode: 'W23-26-001',
        status: 'completed',
        overrideSigns: 12,
        overrideStops: 2,
        overrideDistanceKm: 18.5,
        overrideDurationMinutes: 90,
      },
      invoice: {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-07-01',
        totalAmount: 112.5,
        status: 'paid',
      },
      source: {
        trackerRow: 2,
        routeListFile: 'W23-26-001 - Route List - Route.csv',
      },
    });
    expect(bundle.records[0].stops).toEqual([
      { sequence: 1, address: '10 Example Street', numberOfSigns: 6, agent: 'BO', isAuction: false },
      { sequence: 2, address: '20 Example Street', numberOfSigns: 6, agent: 'BO', isAuction: false },
    ]);
  });

  it('extracts auction flag and agent initials from route-list columns C and D, defaulting agent to BO when blank', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-test-'));
    const routeListsDir = path.join(tempDir, 'route-lists');
    fs.mkdirSync(routeListsDir);

    const trackerPath = path.join(tempDir, 'Tracker - Jobs.csv');
    const routeListPath = path.join(routeListsDir, 'W24-26-001 - Route List - Route.csv');
    const outputPath = path.join(tempDir, 'bundle.json');

    fs.writeFileSync(
      trackerPath,
      [
        'RouteID,Job,Signs,Stops,Kilometers,Invoice,Hours,Rate,Amount,Sent,Paid,CalculatedTotal',
        'W24-26-001,Sample route,6,3,10,INV-002,1:00,$75.00,$75.00,2024-07-01,2024-07-10,999',
      ].join('\n')
    );

    fs.writeFileSync(
      routeListPath,
      [
        'Order,Address,,,Check,Deploy,Pickup,Notes,',
        '1,10 Example Street,🅰️,DM,FALSE,FALSE,FALSE,4,',
        '2,20 Example Street,,,FALSE,FALSE,FALSE,2,',
        '3,30 Example Street,,KP,FALSE,FALSE,FALSE,3,',
      ].join('\n')
    );

    execFileSync(
      'node',
      [
        path.join(process.cwd(), 'scripts/import-prep.js'),
        '--tracker', trackerPath,
        '--route-lists-dir', routeListsDir,
        '--customer-id', 'cust-1',
        '--mode', 'dry-run',
        '--output', outputPath,
      ],
      { stdio: 'pipe' }
    );

    const bundle = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(bundle.records[0].stops).toEqual([
      { sequence: 1, address: '10 Example Street', numberOfSigns: 4, agent: 'DM', isAuction: true },
      { sequence: 2, address: '20 Example Street', numberOfSigns: 2, agent: 'BO', isAuction: false },
      { sequence: 3, address: '30 Example Street', numberOfSigns: 3, agent: 'KP', isAuction: false },
    ]);
  });

  it('resolves per-row Operator/Split columns to a payout and per-row operator assignment, warning on an unmapped operator', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-test-'));
    const routeListsDir = path.join(tempDir, 'route-lists');
    fs.mkdirSync(routeListsDir);

    const trackerPath = path.join(tempDir, 'Tracker - Jobs.csv');
    const outputPath = path.join(tempDir, 'bundle.json');

    fs.writeFileSync(
      trackerPath,
      [
        'RouteID,Job,Signs,Stops,Kilometers,Invoice,Hours,Rate,Amount,Sent,Paid,Operator,Split',
        'W23-26-001,Sample route,12,2,18.5,INV-001,1:30,$30.00,$112.50,2024-07-01,2024-07-10,Adam,$28.13',
        'W24-26-001,Sample route,6,3,10,INV-002,1:00,$30.00,$75.00,2024-07-08,,Dee,$18.75',
      ].join('\n')
    );

    execFileSync(
      'node',
      [
        path.join(process.cwd(), 'scripts/import-prep.js'),
        '--tracker', trackerPath,
        '--route-lists-dir', routeListsDir,
        '--customer-id', 'cust-1',
        '--mode', 'dry-run',
        '--output', outputPath,
        '--operator', 'Adam:adam-sub-123:adam@example.com',
      ],
      { stdio: 'pipe' }
    );

    const bundle = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(bundle.stats.payoutsPrepared).toBe(1);
    expect(bundle.records[0]).toMatchObject({
      route: {
        assignedOperatorName: 'Adam',
        assignedOperatorSub: 'adam-sub-123',
        assignedOperatorEmail: 'adam@example.com',
      },
      payout: {
        operatorSub: 'adam-sub-123',
        amount: 28.13,
        status: 'paid',
      },
    });
    expect(bundle.records[1].payout).toBeNull();
    expect(bundle.records[1].route.assignedOperatorSub).toBeUndefined();
    expect(bundle.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unknown operator 'Dee' for W24-26-001"),
        expect.stringContaining('split amount present but no operator resolved for W24-26-001'),
      ])
    );
  });

  it("dates a legacy Route from its code: placed on that week's Friday, picked up the next day", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-test-'));
    const routeListsDir = path.join(tempDir, 'route-lists');
    fs.mkdirSync(routeListsDir);
    const trackerPath = path.join(tempDir, 'Tracker - Jobs.csv');
    const outputPath = path.join(tempDir, 'bundle.json');

    fs.writeFileSync(
      trackerPath,
      [
        'RouteID,Job,Signs,Stops,Kilometers,Invoice,Hours,Rate,Amount,Sent,Paid',
        // ISO week 30 of 2026 runs Mon 20 Jul to Sun 26 Jul; invoiced that Sunday, paid on Tuesday.
        'W30-26-001,Sample route,12,2,18.5,INV-001,1:30,$30.00,$45.00,26-Jul-2026,28-Jul-2026',
        // ISO week 1 of 2026 starts Mon 29 Dec 2025, so its Friday is 2 Jan.
        'W01-26-001,Sample route,6,1,5,INV-002,1:00,$30.00,$30.00,4-Jan-2026,6-Jan-2026',
      ].join('\n')
    );

    execFileSync(
      'node',
      [
        path.join(process.cwd(), 'scripts/import-prep.js'),
        '--tracker', trackerPath,
        '--route-lists-dir', routeListsDir,
        '--customer-id', 'cust-1',
        '--mode', 'dry-run',
        '--output', outputPath,
        '--default-operator-name', 'Adam',
        '--default-operator-sub', 'adam-sub-123',
        '--default-operator-email', 'adam@example.com',
      ],
      { stdio: 'pipe' }
    );

    const bundle = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(bundle.records[0].route).toMatchObject({
      scheduledDate: '2026-07-24',
      pickupDate: '2026-07-25',
      placedAt: '2026-07-24T00:00:00.000Z',
      completedAt: '2026-07-25T00:00:00.000Z',
      assignedOperatorName: 'Adam',
      assignedAt: '2026-07-24T00:00:00.000Z',
    });
    expect(bundle.records[1].route).toMatchObject({ scheduledDate: '2026-01-02', pickupDate: '2026-01-03' });
  });

  it("reads a Tracker date as the day written, whatever the machine's time zone", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-test-'));
    const routeListsDir = path.join(tempDir, 'route-lists');
    fs.mkdirSync(routeListsDir);
    const trackerPath = path.join(tempDir, 'Tracker - Jobs.csv');
    const outputPath = path.join(tempDir, 'bundle.json');

    fs.writeFileSync(
      trackerPath,
      [
        'RouteID,Job,Signs,Stops,Kilometers,Invoice,Hours,Rate,Amount,Sent,Paid',
        'W24-26-001,Sample route,12,2,18.5,INV-001,1:30,$30.00,$45.00,14-Jun-2026,16-Jun-2026',
      ].join('\n')
    );

    execFileSync(
      'node',
      [
        path.join(process.cwd(), 'scripts/import-prep.js'),
        '--tracker', trackerPath,
        '--route-lists-dir', routeListsDir,
        '--customer-id', 'cust-1',
        '--mode', 'dry-run',
        '--output', outputPath,
      ],
      // Sydney is ahead of UTC, so reading the date as local midnight lands on the 13th.
      { stdio: 'pipe', env: { ...process.env, TZ: 'Australia/Sydney' } }
    );

    const bundle = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(bundle.records[0].invoice).toMatchObject({ invoiceDate: '2026-06-14', sentDate: '2026-06-14' });
  });
});
