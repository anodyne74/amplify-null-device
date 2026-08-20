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
      { sequence: 1, address: '10 Example Street', numberOfSigns: 6, serviceType: 'delivery' },
      { sequence: 2, address: '20 Example Street', numberOfSigns: 6, serviceType: 'delivery' },
    ]);
  });
});