import { slotRepository } from '../repositories/slot.repository';
import { bookingRepository } from '../repositories/booking.repository';
import { withTransaction } from '../db/client';
import { NotFoundError, ConflictError, ValidationError, UnprocessableEntityError } from '../errors/app-error';
import { CreateBookingInput, ListBookingsQuery } from '../validations/booking.schema';
import { Booking, BookingWithSlot, Slot } from '../types';

export class BookingService {
  /**
   * Helper to generate a clean, unique human-readable booking reference (e.g. BK-7X9K2M)
   */
  private generateReference(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `BK-${code}`;
  }

  /**
   * Atomic Booking of a Slot with strict row-level lock concurrency guarantee.
   * Prevents double-booking even under massive simultaneous requests.
   */
  async bookSlot(
    slotId: string,
    data: CreateBookingInput
  ): Promise<{ booking: Booking; slot: Slot }> {
    return await withTransaction(async (client) => {
      // 1. Acquire exclusive row lock on the target slot row
      const slot = await slotRepository.findByIdForUpdate(slotId, client);

      // 2. Validate existence
      if (!slot) {
        throw new NotFoundError(`Time slot with ID "${slotId}" was not found`, 'SLOT_NOT_FOUND');
      }

      // 3. Validate status
      if (slot.status === 'CANCELLED') {
        throw new ConflictError(
          'Cannot book this appointment because the clinic has cancelled the time slot',
          'SLOT_CANCELLED'
        );
      }

      if (slot.status === 'BOOKED') {
        throw new ConflictError(
          'This time slot has already been booked by another patient',
          'SLOT_ALREADY_BOOKED'
        );
      }

      if (slot.status !== 'AVAILABLE') {
        throw new ConflictError(
          `This time slot is not available for booking (current status: ${slot.status})`,
          'SLOT_UNAVAILABLE'
        );
      }

      // 4. Validate slot is not in the past
      const slotStartTime = new Date(slot.start_time).getTime();
      const now = Date.now();
      if (slotStartTime < now) {
        throw new UnprocessableEntityError(
          'Cannot book an appointment slot that is in the past',
          'SLOT_IN_PAST'
        );
      }

      // 5. Generate unique booking reference
      let bookingReference = this.generateReference();
      let attempts = 0;
      while (attempts < 5) {
        const existingRef = await bookingRepository.findByIdOrReference(bookingReference, client);
        if (!existingRef) break;
        bookingReference = this.generateReference();
        attempts++;
      }

      // 6. Create Confirmed Booking record
      const booking = await bookingRepository.createBooking(
        {
          booking_reference: bookingReference,
          slot_id: slot.id,
          patient_name: data.patient_name.trim(),
          patient_email: data.patient_email.trim().toLowerCase(),
          patient_phone: data.patient_phone.trim(),
          notes: data.notes || null,
        },
        client
      );

      // 7. Update Slot status to BOOKED
      const updatedSlot = await slotRepository.updateStatus(slot.id, 'BOOKED', client);

      return {
        booking,
        slot: updatedSlot,
      };
    });
  }

  /**
   * Cancel an existing booking
   * Releases the slot back to 'AVAILABLE' if the slot was not independently cancelled.
   */
  async cancelBooking(idOrReference: string): Promise<{ booking: Booking; slot: Slot | null }> {
    return await withTransaction(async (client) => {
      // 1. Acquire row lock on the booking
      const booking = await bookingRepository.findByIdOrReferenceForUpdate(idOrReference, client);

      if (!booking) {
        throw new NotFoundError(
          `Booking with identifier "${idOrReference}" was not found`,
          'BOOKING_NOT_FOUND'
        );
      }

      if (booking.status === 'CANCELLED') {
        throw new ConflictError(
          'This booking has already been cancelled',
          'BOOKING_ALREADY_CANCELLED'
        );
      }

      // 2. Mark booking as CANCELLED
      const updatedBooking = await bookingRepository.updateStatus(booking.id, 'CANCELLED', client);

      // 3. Lock associated slot and release back to AVAILABLE if not cancelled
      const slot = await slotRepository.findByIdForUpdate(booking.slot_id, client);
      let updatedSlot: Slot | null = null;

      if (slot) {
        if (slot.status === 'BOOKED') {
          updatedSlot = await slotRepository.updateStatus(slot.id, 'AVAILABLE', client);
        } else {
          updatedSlot = slot;
        }
      }

      return {
        booking: updatedBooking,
        slot: updatedSlot,
      };
    });
  }

  /**
   * Retrieve booking details with slot and clinic info
   */
  async getBooking(idOrReference: string): Promise<BookingWithSlot> {
    const booking = await bookingRepository.findByIdOrReference(idOrReference);
    if (!booking) {
      throw new NotFoundError(
        `Booking with identifier "${idOrReference}" was not found`,
        'BOOKING_NOT_FOUND'
      );
    }

    const { bookings } = await bookingRepository.listBookings({
      patient_email: booking.patient_email,
      limit: 100,
      offset: 0,
    });

    const match = bookings.find((b) => b.id === booking.id || b.booking_reference === booking.booking_reference);
    if (match) return match;

    const slot = await slotRepository.findById(booking.slot_id);
    if (!slot) {
      throw new NotFoundError('Associated slot for booking was not found', 'SLOT_NOT_FOUND');
    }

    return {
      ...booking,
      slot,
    };
  }

  /**
   * List bookings with query filters
   */
  async listBookings(filters: Partial<ListBookingsQuery>): Promise<{ bookings: BookingWithSlot[]; total: number }> {
    return await bookingRepository.listBookings({
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
      ...filters,
    });
  }
}

export const bookingService = new BookingService();
