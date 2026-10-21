import { slotRepository } from '../repositories/slot.repository';
import { bookingRepository } from '../repositories/booking.repository';
import { withTransaction, query } from '../db/client';
import { NotFoundError, ConflictError, ValidationError } from '../errors/app-error';
import { CreateSlotInput, ListSlotsQuery } from '../validations/slot.schema';
import { Slot, SlotWithDetails } from '../types';

export class SlotService {
  /**
   * Create a new clinic time slot
   */
  async createSlot(data: CreateSlotInput): Promise<Slot> {
    const start = new Date(data.start_time);
    const end = new Date(data.end_time);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Invalid date format for start_time or end_time');
    }

    if (end.getTime() <= start.getTime()) {
      throw new ValidationError('end_time must be strictly after start_time');
    }

    // Ensure clinic exists (or auto-register minimal clinic record)
    const clinicCheck = await query('SELECT id FROM clinics WHERE id = $1', [data.clinic_id]);
    if (clinicCheck.rowCount === 0) {
      await query(
        `INSERT INTO clinics (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [data.clinic_id, `Clinic ${data.clinic_id}`]
      );
    }

    // Check for doctor overlapping slots
    const hasOverlap = await slotRepository.hasOverlappingSlot(
      data.clinic_id,
      data.doctor_name,
      start.toISOString(),
      end.toISOString()
    );

    if (hasOverlap) {
      throw new ConflictError(
        `Dr. ${data.doctor_name} already has an overlapping active time slot in this time range`,
        'SLOT_OVERLAP'
      );
    }

    return await slotRepository.createSlot(data);
  }

  /**
   * List slots with filters
   */
  async listSlots(filters: Partial<ListSlotsQuery> = {}): Promise<{ slots: SlotWithDetails[]; total: number }> {
    return await slotRepository.listSlots({
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
      ...filters,
    });
  }

  /**
   * Get slot by ID
   */
  async getSlotById(id: string): Promise<SlotWithDetails> {
    const result = await slotRepository.listSlots({ limit: 1, offset: 0 });
    // Or direct query
    const slot = await slotRepository.findById(id);
    if (!slot) {
      throw new NotFoundError(`Time slot with ID "${id}" was not found`, 'SLOT_NOT_FOUND');
    }
    const { slots } = await slotRepository.listSlots({ limit: 1, offset: 0 });
    const match = (await slotRepository.listSlots({ limit: 10, offset: 0 })).slots.find((s) => s.id === id);
    return match || slot;
  }

  /**
   * Cancel an appointment slot (Clinic action)
   */
  async cancelSlot(id: string): Promise<{ slot: Slot; cancelledBookingsCount: number }> {
    return await withTransaction(async (client) => {
      // 1. Lock slot row exclusively
      const slot = await slotRepository.findByIdForUpdate(id, client);

      if (!slot) {
        throw new NotFoundError(`Time slot with ID "${id}" was not found`, 'SLOT_NOT_FOUND');
      }

      if (slot.status === 'CANCELLED') {
        throw new ConflictError('This time slot is already cancelled', 'SLOT_ALREADY_CANCELLED');
      }

      // 2. Mark slot as CANCELLED
      const updatedSlot = await slotRepository.updateStatus(id, 'CANCELLED', client);

      // 3. If slot had a confirmed booking, cancel it as well
      const cancelledBookingsCount = await bookingRepository.cancelActiveBookingsBySlotId(id, client);

      return {
        slot: updatedSlot,
        cancelledBookingsCount,
      };
    });
  }
}

export const slotService = new SlotService();
