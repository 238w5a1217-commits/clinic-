import { NextRequest, NextResponse } from 'next/server';
import { bookingService } from '@/core/services/booking.service';
import { handleApiError } from '@/core/errors/error-handler';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/bookings/:id
 * Retrieve booking details by UUID or reference code (e.g. BK-7X9K2M)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const booking = await bookingService.getBooking(id);

    return NextResponse.json(
      {
        success: true,
        data: booking,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/bookings/:id
 * Cancel a booking and release the slot
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await bookingService.cancelBooking(id);

    return NextResponse.json(
      {
        success: true,
        data: result,
        message: 'Booking cancelled successfully. Slot has been released.',
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
