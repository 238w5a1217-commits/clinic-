import { NextRequest, NextResponse } from 'next/server';
import { bookingService } from '@/core/services/booking.service';
import { DirectBookingSchema, ListBookingsQuerySchema } from '@/core/validations/booking.schema';
import { handleApiError } from '@/core/errors/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings
 * List bookings with filters (patient_email, status, clinic_id)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = ListBookingsQuerySchema.parse(searchParams);

    const { bookings, total } = await bookingService.listBookings(query);

    return NextResponse.json(
      {
        success: true,
        data: bookings,
        meta: {
          total,
          limit: query.limit,
          offset: query.offset,
          count: bookings.length,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/bookings
 * Book an appointment slot directly via payload containing slot_id
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = DirectBookingSchema.parse(body);

    const { slot_id, ...patientInfo } = validated;
    const result = await bookingService.bookSlot(slot_id, patientInfo);

    return NextResponse.json(
      {
        success: true,
        data: result,
        message: 'Appointment booked successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
