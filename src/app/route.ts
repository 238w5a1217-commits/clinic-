import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    name: 'Clinic Appointment Booking API',
    version: '1.0.0',
    status: 'online',
    description: 'High-concurrency appointment booking API with strict row-level lock double-booking prevention.',
    endpoints: {
      health: 'GET /api/health',
      clinics: {
        list: 'GET /api/clinics',
        create: 'POST /api/clinics',
      },
      slots: {
        list: 'GET /api/slots?clinic_id=&status=&date=&doctor_name=&limit=&offset=',
        getById: 'GET /api/slots/:id',
        create: 'POST /api/slots',
        cancel: 'PATCH /api/slots/:id/cancel',
        delete: 'DELETE /api/slots/:id',
        book: 'POST /api/slots/:id/book',
      },
      bookings: {
        list: 'GET /api/bookings?clinic_id=&patient_email=&status=&limit=&offset=',
        getById: 'GET /api/bookings/:id',
        create: 'POST /api/bookings',
        cancel: 'PATCH /api/bookings/:id/cancel',
        delete: 'DELETE /api/bookings/:id',
      },
    },
  });
}
