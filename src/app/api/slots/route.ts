import { NextRequest, NextResponse } from 'next/server';
import { slotService } from '@/core/services/slot.service';
import { CreateSlotsBatchSchema, ListSlotsQuerySchema } from '@/core/validations/slot.schema';
import { handleApiError } from '@/core/errors/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/slots
 * List time slots with optional filters (clinic_id, doctor_name, status, date, from, to)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = ListSlotsQuerySchema.parse(searchParams);

    const { slots, total } = await slotService.listSlots(query);

    return NextResponse.json(
      {
        success: true,
        data: slots,
        meta: {
          total,
          limit: query.limit,
          offset: query.offset,
          count: slots.length,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/slots
 * Publish a new time slot or a batch of time slots (Clinic action)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CreateSlotsBatchSchema.parse(body);

    if (Array.isArray(validated)) {
      const createdSlots = [];
      for (const item of validated) {
        const slot = await slotService.createSlot(item);
        createdSlots.push(slot);
      }
      return NextResponse.json(
        {
          success: true,
          data: createdSlots,
          message: `Successfully created ${createdSlots.length} time slots.`,
        },
        { status: 201 }
      );
    } else {
      const slot = await slotService.createSlot(validated);
      return NextResponse.json(
        {
          success: true,
          data: slot,
          message: 'Time slot created and published successfully.',
        },
        { status: 201 }
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
