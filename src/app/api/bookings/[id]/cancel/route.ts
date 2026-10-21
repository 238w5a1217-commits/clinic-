import { NextRequest, NextResponse } from 'next/server';
import { bookingService } from '@/core/services/booking.service';
import { handleApiError } from '@/core/errors/error-handler';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/bookings/:id/cancel
 * Cancel a booking and release the slot back to AVAILABLE
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await bookingService.cancelBooking(id);

    return NextResponse.json(
      {
        success: true,
        data: result,
        message: 'Booking cancelled successfully. Slot has been restored to available.',
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  return PATCH(request, context);
}
