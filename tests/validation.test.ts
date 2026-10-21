import { describe, it, expect } from 'vitest';
import { CreateSlotSchema } from '../src/core/validations/slot.schema';
import { CreateBookingSchema } from '../src/core/validations/booking.schema';
import { slotService } from '../src/core/services/slot.service';
import { ConflictError, ValidationError } from '../src/core/errors/app-error';

describe('Input Validation & Constraints', () => {
  it('Should reject slot creation when end_time is earlier than start_time', () => {
    const invalidSlot = {
      clinic_id: 'clinic-central',
      doctor_name: 'Dr. Jane',
      start_time: '2026-10-25T11:00:00.000Z',
      end_time: '2026-10-25T10:00:00.000Z', // 1 hour earlier!
    };

    const result = CreateSlotSchema.safeParse(invalidSlot);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('end_time must be strictly after start_time');
    }
  });

  it('Should reject slot creation when start_time equals end_time', () => {
    const invalidSlot = {
      clinic_id: 'clinic-central',
      doctor_name: 'Dr. Jane',
      start_time: '2026-10-25T10:00:00.000Z',
      end_time: '2026-10-25T10:00:00.000Z',
    };

    const result = CreateSlotSchema.safeParse(invalidSlot);
    expect(result.success).toBe(false);
  });

  it('Should reject booking when email is malformed', () => {
    const invalidBooking = {
      patient_name: 'John Doe',
      patient_email: 'not-an-email',
      patient_phone: '+1-555-1234',
    };

    const result = CreateBookingSchema.safeParse(invalidBooking);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('must be a valid email');
    }
  });

  it('Should reject booking when patient_name is too short or missing', () => {
    const invalidBooking = {
      patient_name: 'A',
      patient_email: 'john@example.com',
      patient_phone: '+1-555-1234',
    };

    const result = CreateBookingSchema.safeParse(invalidBooking);
    expect(result.success).toBe(false);
  });

  it('Should reject publishing overlapping slots for the same doctor at the same clinic', async () => {
    const clinicId = `test-overlap-${Date.now()}`;
    const start = new Date(Date.now() + 100 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

    // Create first slot
    await slotService.createSlot({
      clinic_id: clinicId,
      doctor_name: 'Dr. Overlap',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    });

    // Try creating overlapping slot (e.g. starts 15 mins in)
    const overlappingStart = new Date(start.getTime() + 15 * 60 * 1000);
    const overlappingEnd = new Date(overlappingStart.getTime() + 30 * 60 * 1000);

    await expect(
      slotService.createSlot({
        clinic_id: clinicId,
        doctor_name: 'Dr. Overlap',
        start_time: overlappingStart.toISOString(),
        end_time: overlappingEnd.toISOString(),
      })
    ).rejects.toThrow(ConflictError);
  });
});
