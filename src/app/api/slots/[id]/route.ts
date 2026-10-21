import { NextRequest, NextResponse } from 'next/server';
import { slotService } from '@/core/services/slot.service';
import { handleApiError } from '@/core/errors/error-handler';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/slots/:id
 * Retrieve specific slot details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const slot = await slotService.getSlotById(id);

    return NextResponse.json(
      {
        success: true,
        data: slot,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/slots/:id
 * Cancel an appointment slot
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
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
