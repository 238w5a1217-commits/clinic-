import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { slotService } from '../src/core/services/slot.service';
import { bookingService } from '../src/core/services/booking.service';
import { query } from '../src/core/db/client';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../src/core/errors/app-error';

describe('Booking Rules & Business Logic', () => {
  const testClinicId = `test-clinic-${Date.now()}`;
  let availableSlotId: string;
  let pastSlotId: string;
  let slotToCancelId: string;

  beforeAll(async () => {
    // 1. Create a dedicated test clinic
    await query(
      `INSERT INTO clinics (id, name, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING;`,
      [testClinicId, 'Automated Test Clinic', 'test@clinic.org']
    );

    // 2. Create a future available slot
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);

    const slot = await slotService.createSlot({
      clinic_id: testClinicId,
      doctor_name: 'Dr. Jane Test',
      start_time: futureStart.toISOString(),
      end_time: futureEnd.toISOString(),
    });
    availableSlotId = slot.id;

    // 3. Create a slot in the past directly in DB for testing past slot rule
    const pastStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const pastRes = await query(
      `INSERT INTO slots (clinic_id, doctor_name, start_time, end_time, status)
       VALUES ($1, 'Dr. Past', $2, $3, 'AVAILABLE')
       RETURNING id;`,
      [testClinicId, pastStart.toISOString(), pastEnd.toISOString()]
    );
    pastSlotId = pastRes.rows[0].id;

    // 4. Create another slot for cancellation testing
    const cancelStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const cancelEnd = new Date(cancelStart.getTime() + 30 * 60 * 1000);
    const cancelSlot = await slotService.createSlot({
      clinic_id: testClinicId,
      doctor_name: 'Dr. Jane Test',
      start_time: cancelStart.toISOString(),
      end_time: cancelEnd.toISOString(),
    });
    slotToCancelId = cancelSlot.id;
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await query(`DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE clinic_id = $1);`, [testClinicId]);
      await query(`DELETE FROM slots WHERE clinic_id = $1;`, [testClinicId]);
      await query(`DELETE FROM clinics WHERE id = $1;`, [testClinicId]);
    } catch {
      // ignore
    }
  });

  it('Rule 1: Should successfully book an available time slot', async () => {
    const result = await bookingService.bookSlot(availableSlotId, {
      patient_name: 'Alice Johnson',
      patient_email: 'alice@example.com',
      patient_phone: '+1-555-0199',
      notes: 'Routine checkup',
    });

    expect(result.booking).toBeDefined();
    expect(result.booking.status).toBe('CONFIRMED');
    expect(result.booking.patient_name).toBe('Alice Johnson');
    expect(result.booking.booking_reference).toMatch(/^BK-[A-Z0-9]+$/);
    expect(result.slot.status).toBe('BOOKED');

    // Verify slot in DB is now BOOKED
    const slotInDb = await slotService.getSlotById(availableSlotId);
    expect(slotInDb.status).toBe('BOOKED');
  });

  it('Rule 2: Double-Booking Prevention - Should reject booking an already booked slot with 409 Conflict', async () => {
    // Attempting to book the same slot again
    await expect(
      bookingService.bookSlot(availableSlotId, {
        patient_name: 'Bob Smith',
        patient_email: 'bob@example.com',
        patient_phone: '+1-555-0200',
      })
    ).rejects.toThrow(ConflictError);

    try {
      await bookingService.bookSlot(availableSlotId, {
        patient_name: 'Bob Smith',
        patient_email: 'bob@example.com',
        patient_phone: '+1-555-0200',
      });
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('SLOT_ALREADY_BOOKED');
    }
  });

  it('Rule 3: Should reject booking a slot that has been cancelled by the clinic', async () => {
    // Cancel slotToCancelId
    await slotService.cancelSlot(slotToCancelId);

    // Try booking cancelled slot
    await expect(
      bookingService.bookSlot(slotToCancelId, {
        patient_name: 'Charlie Brown',
        patient_email: 'charlie@example.com',
        patient_phone: '+1-555-0300',
      })
    ).rejects.toThrow(ConflictError);

    try {
      await bookingService.bookSlot(slotToCancelId, {
        patient_name: 'Charlie Brown',
        patient_email: 'charlie@example.com',
        patient_phone: '+1-555-0300',
      });
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('SLOT_CANCELLED');
    }
  });

  it('Rule 4: Should reject booking a non-existent slot with 404 Not Found', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    await expect(
      bookingService.bookSlot(fakeUuid, {
        patient_name: 'Ghost User',
        patient_email: 'ghost@example.com',
        patient_phone: '+1-555-0999',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('Rule 5: Should reject booking a time slot in the past with 422 Unprocessable Entity', async () => {
    await expect(
      bookingService.bookSlot(pastSlotId, {
        patient_name: 'Time Traveler',
        patient_email: 'past@example.com',
        patient_phone: '+1-555-0400',
      })
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it('Rule 6: Cancelling a booking should release the slot back to AVAILABLE for other patients', async () => {
    // Find active booking on availableSlotId
    const slotData = await slotService.getSlotById(availableSlotId);
    expect(slotData.booking).toBeDefined();
    const bookingId = slotData.booking!.id;

    // Cancel the booking
    const cancelRes = await bookingService.cancelBooking(bookingId);
    expect(cancelRes.booking.status).toBe('CANCELLED');
    expect(cancelRes.slot?.status).toBe('AVAILABLE');

    // Verify slot in DB is now AVAILABLE again
    const refreshedSlot = await slotService.getSlotById(availableSlotId);
    expect(refreshedSlot.status).toBe('AVAILABLE');

    // A new patient should now be able to book it!
    const rebook = await bookingService.bookSlot(availableSlotId, {
      patient_name: 'Dana Scully',
      patient_email: 'dana@example.com',
      patient_phone: '+1-555-0500',
    });
    expect(rebook.booking.status).toBe('CONFIRMED');
    expect(rebook.slot.status).toBe('BOOKED');
  });

  it('Rule 7: Cancelling an already cancelled booking should return 409 Conflict', async () => {
    // Find the first cancelled booking
    const { bookings } = await bookingService.listBookings({
      patient_email: 'alice@example.com',
      status: 'CANCELLED',
    });
    expect(bookings.length).toBeGreaterThan(0);
    const cancelledBooking = bookings[0];

    await expect(bookingService.cancelBooking(cancelledBooking.id)).rejects.toThrow(ConflictError);

    try {
      await bookingService.cancelBooking(cancelledBooking.id);
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('BOOKING_ALREADY_CANCELLED');
    }
  });

  it('Rule 8: Clinic cancelling a slot with an active booking should cancel both slot and booking', async () => {
    // Create new slot
    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const newSlot = await slotService.createSlot({
      clinic_id: testClinicId,
      doctor_name: 'Dr. House',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    });

    // Book it
    const booked = await bookingService.bookSlot(newSlot.id, {
      patient_name: 'Fox Mulder',
      patient_email: 'mulder@example.com',
      patient_phone: '+1-555-0700',
    });
    expect(booked.booking.status).toBe('CONFIRMED');

    // Clinic cancels slot
    const cancelRes = await slotService.cancelSlot(newSlot.id);
    expect(cancelRes.slot.status).toBe('CANCELLED');
    expect(cancelRes.cancelledBookingsCount).toBe(1);

    // Verify booking is cancelled in DB
    const fetchedBooking = await bookingService.getBooking(booked.booking.id);
    expect(fetchedBooking.status).toBe('CANCELLED');
  });
});
