import { PoolClient } from 'pg';
import { query } from '../db/client';
import { Booking, BookingWithSlot, BookingStatus } from '../types';
import { ListBookingsQuery } from '../validations/booking.schema';

export class BookingRepository {
  /**
   * Create a new confirmed booking
   */
  async createBooking(
    data: {
      booking_reference: string;
      slot_id: string;
      patient_name: string;
      patient_email: string;
      patient_phone: string;
      notes?: string | null;
    },
    client: PoolClient
  ): Promise<Booking> {
    const sql = `
      INSERT INTO bookings (
        booking_reference, slot_id, patient_name, patient_email, patient_phone, notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED')
      RETURNING *;
    `;
    const params = [
      data.booking_reference,
      data.slot_id,
      data.patient_name,
      data.patient_email,
      data.patient_phone,
      data.notes || null,
    ];

    const res = await client.query<Booking>(sql, params);
    return res.rows[0];
  }

  /**
   * Find booking by ID or reference
   */
  async findByIdOrReference(idOrReference: string, client?: PoolClient): Promise<Booking | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrReference);
    const sql = isUuid
      ? `SELECT * FROM bookings WHERE id = $1;`
      : `SELECT * FROM bookings WHERE booking_reference = $1;`;

    const res = client
      ? await client.query<Booking>(sql, [idOrReference])
      : await query<Booking>(sql, [idOrReference]);

    return res.rows[0] || null;
  }

  /**
   * Find booking with row lock for cancellation
   */
  async findByIdOrReferenceForUpdate(idOrReference: string, client: PoolClient): Promise<Booking | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrReference);
    const sql = isUuid
      ? `SELECT * FROM bookings WHERE id = $1 FOR UPDATE;`
      : `SELECT * FROM bookings WHERE booking_reference = $1 FOR UPDATE;`;

    const res = await client.query<Booking>(sql, [idOrReference]);
    return res.rows[0] || null;
  }

  /**
   * Find active confirmed booking for a given slot
   */
  async findActiveBySlotId(slotId: string, client?: PoolClient): Promise<Booking | null> {
    const sql = `SELECT * FROM bookings WHERE slot_id = $1 AND status = 'CONFIRMED';`;
    const res = client
      ? await client.query<Booking>(sql, [slotId])
      : await query<Booking>(sql, [slotId]);
    return res.rows[0] || null;
  }

  /**
   * Update booking status and cancellation timestamp
   */
  async updateStatus(id: string, status: BookingStatus, client?: PoolClient): Promise<Booking> {
    const sql = `
      UPDATE bookings 
      SET status = $2::varchar, 
          cancelled_at = CASE WHEN $2::varchar = 'CANCELLED' THEN NOW() ELSE NULL END
      WHERE id = $1 
      RETURNING *;
    `;
    const res = client
      ? await client.query<Booking>(sql, [id, status])
      : await query<Booking>(sql, [id, status]);
    return res.rows[0];
  }

  /**
   * Cancel active bookings by slot ID (used when a clinic cancels a slot)
   */
  async cancelActiveBookingsBySlotId(slotId: string, client: PoolClient): Promise<number> {
    const sql = `
      UPDATE bookings 
      SET status = 'CANCELLED', cancelled_at = NOW() 
      WHERE slot_id = $1 AND status = 'CONFIRMED'
      RETURNING id;
    `;
    const res = await client.query(sql, [slotId]);
    return res.rowCount ?? 0;
  }

  /**
   * List bookings with attached slot details
   */
  async listBookings(filters: ListBookingsQuery): Promise<{ bookings: BookingWithSlot[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.patient_email) {
      conditions.push(`b.patient_email = $${paramIndex++}`);
      params.push(filters.patient_email.toLowerCase());
    }

    if (filters.status) {
      conditions.push(`b.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.clinic_id) {
      conditions.push(`s.clinic_id = $${paramIndex++}`);
      params.push(filters.clinic_id);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `
      SELECT COUNT(*) as count 
      FROM bookings b
      JOIN slots s ON s.id = b.slot_id
      WHERE ${whereClause};
    `;
    const countRes = await query<{ count: string }>(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataSql = `
      SELECT 
        b.*,
        s.id as slot_table_id,
        s.clinic_id,
        s.doctor_name,
        s.start_time,
        s.end_time,
        s.status as slot_status,
        s.created_at as slot_created_at,
        s.updated_at as slot_updated_at,
        c.name as clinic_name,
        c.address as clinic_address
      FROM bookings b
      JOIN slots s ON s.id = b.slot_id
      LEFT JOIN clinics c ON c.id = s.clinic_id
      WHERE ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    const dataRes = await query<any>(dataSql, [...params, filters.limit, filters.offset]);

    const bookings: BookingWithSlot[] = dataRes.rows.map((row) => ({
      id: row.id,
      booking_reference: row.booking_reference,
      slot_id: row.slot_id,
      patient_name: row.patient_name,
      patient_email: row.patient_email,
      patient_phone: row.patient_phone,
      status: row.status,
      notes: row.notes,
      created_at: row.created_at.toISOString ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      cancelled_at: row.cancelled_at
        ? (row.cancelled_at.toISOString ? row.cancelled_at.toISOString() : new Date(row.cancelled_at).toISOString())
        : null,
      slot: {
        id: row.slot_table_id,
        clinic_id: row.clinic_id,
        doctor_name: row.doctor_name,
        start_time: row.start_time.toISOString ? row.start_time.toISOString() : new Date(row.start_time).toISOString(),
        end_time: row.end_time.toISOString ? row.end_time.toISOString() : new Date(row.end_time).toISOString(),
        status: row.slot_status,
        created_at: row.slot_created_at.toISOString ? row.slot_created_at.toISOString() : new Date(row.slot_created_at).toISOString(),
        updated_at: row.slot_updated_at.toISOString ? row.slot_updated_at.toISOString() : new Date(row.slot_updated_at).toISOString(),
      },
      clinic: row.clinic_name
        ? {
            id: row.clinic_id,
            name: row.clinic_name,
            address: row.clinic_address,
            email: null,
            phone: null,
            created_at: '',
          }
        : undefined,
    }));

    return { bookings, total };
  }
}

export const bookingRepository = new BookingRepository();
