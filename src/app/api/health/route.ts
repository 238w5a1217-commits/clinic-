import { NextResponse } from 'next/server';
import { testConnection } from '@/core/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbOk = await testConnection();

  return NextResponse.json(
    {
      status: dbOk ? 'healthy' : 'unhealthy',
      database: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      service: 'clinic-appointment-booking-api',
      version: '1.0.0',
    },
    { status: dbOk ? 200 : 503 }
  );
}
