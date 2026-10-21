import { NextRequest, NextResponse } from 'next/server';
import { bookingService } from '@/core/services/booking.service';
import { CreateBookingSchema } from '@/core/validations/booking.schema';
import { handleApiError } from '@/core/errors/error-handler';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/slots/:id/book
 * Atomic booking of a time slot by a patient
 * Guaranteed double-booking prevention through row-level locking.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const validatedData = CreateBookingSchema.parse(body);

    const result = await bookingService.bookSlot(id, validatedData);

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
