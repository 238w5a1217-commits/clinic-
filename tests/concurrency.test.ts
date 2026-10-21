import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { slotService } from '../src/core/services/slot.service';
import { bookingService } from '../src/core/services/booking.service';
import { query } from '../src/core/db/client';

describe('Concurrency & Double-Booking Guarantee (Stress Test)', () => {
  const testClinicId = `concurrency-clinic-${Date.now()}`;
  let targetSlotId: string;

  beforeAll(async () => {
    // Register test clinic
    await query(
      `INSERT INTO clinics (id, name, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING;`,
      [testClinicId, 'Concurrency Stress Clinic', 'stress@test.com']
    );

    // Create a target slot tomorrow
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    const slot = await slotService.createSlot({
      clinic_id: testClinicId,
      doctor_name: 'Dr. Lock',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });

    targetSlotId = slot.id;
  });

  afterAll(async () => {
    try {
      await query(`DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE clinic_id = $1);`, [testClinicId]);
      await query(`DELETE FROM slots WHERE clinic_id = $1;`, [testClinicId]);
      await query(`DELETE FROM clinics WHERE id = $1;`, [testClinicId]);
    } catch {
      // ignore
    }
  });

  it('CRITICAL: 10 simultaneous booking requests at the same millisecond must yield exactly 1 success and 9 conflicts', async () => {
    const concurrencyCount = 10;
    const patientRequests = Array.from({ length: concurrencyCount }, (_, i) => ({
      patient_name: `Concurrent Patient ${i + 1}`,
      patient_email: `patient${i + 1}_${Date.now()}@test.com`,
      patient_phone: `+1-555-010${i}`,
      notes: `Race condition test request #${i + 1}`,
    }));

    // Fire all 10 booking requests at the exact same instant using Promise.allSettled
    console.log(`⚡ Launching ${concurrencyCount} simultaneous concurrent booking requests on slot ${targetSlotId}...`);
    const results = await Promise.allSettled(
      patientRequests.map((patient) => bookingService.bookSlot(targetSlotId, patient))
    );

    const successful = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(`📊 Concurrency Test Results: ${successful.length} fulfilled, ${rejected.length} rejected.`);

    // 1. Verify exactly ONE booking succeeded
    expect(successful.length).toBe(1);

    // 2. Verify all other 9 requests were rejected with ConflictError
    expect(rejected.length).toBe(concurrencyCount - 1);

    for (const rej of rejected) {
      if (rej.status === 'rejected') {
        const error = rej.reason;
        // Either caught by application row-lock check (SLOT_ALREADY_BOOKED)
        // or by database unique partial index (23505)
        expect(['SLOT_ALREADY_BOOKED', 'CONFLICT'].includes(error.code) || error.statusCode === 409).toBe(true);
      }
    }

    // 3. Database Integrity Check: Query PostgreSQL directly
    const dbBookings = await query(
      `SELECT id, booking_reference, patient_name, status 
       FROM bookings 
       WHERE slot_id = $1 AND status = 'CONFIRMED';`,
      [targetSlotId]
    );

    expect(dbBookings.rows.length).toBe(1);

    // 4. Verify slot status in DB is BOOKED
    const dbSlot = await query(`SELECT status FROM slots WHERE id = $1;`, [targetSlotId]);
    expect(dbSlot.rows[0].status).toBe('BOOKED');
  });

  it('Non-competing requests on different slots should all succeed concurrently', async () => {
    const slots = [];
    for (let i = 0; i < 3; i++) {
      const s = new Date(Date.now() + (48 + i * 2) * 60 * 60 * 1000);
      const e = new Date(s.getTime() + 30 * 60 * 1000);
      const created = await slotService.createSlot({
        clinic_id: testClinicId,
        doctor_name: `Dr. MultiSlot ${i}`,
        start_time: s.toISOString(),
        end_time: e.toISOString(),
      });
      slots.push(created);
    }

    // Book all 3 different slots concurrently
    const parallelBookings = await Promise.all(
      slots.map((slot, idx) =>
        bookingService.bookSlot(slot.id, {
          patient_name: `Parallel Patient ${idx}`,
          patient_email: `parallel_${idx}_${Date.now()}@test.com`,
          patient_phone: '+1-555-8888',
        })
      )
    );

    expect(parallelBookings.length).toBe(3);
    for (const b of parallelBookings) {
      expect(b.booking.status).toBe('CONFIRMED');
      expect(b.slot.status).toBe('BOOKED');
    }
  });
});
