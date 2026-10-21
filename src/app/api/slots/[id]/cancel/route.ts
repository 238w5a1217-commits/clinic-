import { NextRequest, NextResponse } from 'next/server';
import { slotService } from '@/core/services/slot.service';
import { handleApiError } from '@/core/errors/error-handler';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/slots/:id/cancel
 * Clinic cancels a time slot
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await slotService.cancelSlot(id);

    return NextResponse.json(
      {
        success: true,
        data: result.slot,
        message: `Slot cancelled successfully.${
          result.cancelledBookingsCount > 0
            ? ` ${result.cancelledBookingsCount} active booking was also cancelled.`
            : ''
        }`,
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
