import { NextResponse } from 'next/server';
import { buildNumber } from '@/lib/buildNumber';

// Public on purpose: anyone can ask which Build is deployed, and it says nothing more.
export function GET() {
  return NextResponse.json({ build: buildNumber() }, { headers: { 'Cache-Control': 'no-store' } });
}
