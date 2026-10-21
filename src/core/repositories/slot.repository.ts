import { PoolClient } from 'pg';
import { query } from '../db/client';
import { Slot, SlotWithDetails, SlotStatus } from '../types';
import { CreateSlotInput, ListSlotsQuery } from '../validations/slot.schema';

export class SlotRepository {
  /**
   * Insert a new time slot
   */
  async createSlot(data: CreateSlotInput, client?: PoolClient): Promise<Slot> {
    const sql = `
      INSERT INTO slots (clinic_id, doctor_name, start_time, end_time, status)
      VALUES ($1, $2, $3, $4, 'AVAILABLE')
      RETURNING *;
    `;
    const params = [data.clinic_id, data.doctor_name, data.start_time, data.end_time];
    const res = client ? await client.query<Slot>(sql, params) : await query<Slot>(sql, params);
    return res.rows[0];
  }

  /**
   * Find a slot by ID without row lock
   */
  async findById(id: string, client?: PoolClient): Promise<Slot | null> {
    const sql = `SELECT * FROM slots WHERE id = $1;`;
    const res = client ? await client.query<Slot>(sql, [id]) : await query<Slot>(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Find a slot by ID with exclusive row-level lock (FOR UPDATE)
   * This is the cornerstone of atomic concurrency control.
   */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<Slot | null> {
    const sql = `SELECT * FROM slots WHERE id = $1 FOR UPDATE;`;
    const res = await client.query<Slot>(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Check for overlapping time slots for the same clinic and doctor
   */
  async hasOverlappingSlot(
    clinicId: string,
    doctorName: string,
    startTime: string,
    endTime: string,
    excludeSlotId?: string,
    client?: PoolClient
  ): Promise<boolean> {
    let sql = `
      SELECT id FROM slots 
      WHERE clinic_id = $1 
      AND doctor_name = $2 
      AND status != 'CANCELLED'
      AND (
        (start_time < $4 AND end_time > $3)
      )
    `;
    const params: unknown[] = [clinicId, doctorName, startTime, endTime];

    if (excludeSlotId) {
      sql += ` AND id != $5`;
      params.push(excludeSlotId);
    }

    const res = client ? await client.query(sql, params) : await query(sql, params);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Update slot status (AVAILABLE, BOOKED, CANCELLED)
   */
  async updateStatus(id: string, status: SlotStatus, client?: PoolClient): Promise<Slot> {
    const sql = `
      UPDATE slots 
      SET status = $2, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *;
    `;
    const res = client ? await client.query<Slot>(sql, [id, status]) : await query<Slot>(sql, [id, status]);
    return res.rows[0];
  }

  /**
   * List slots with flexible filters and active booking details
   */
  async listSlots(filters: ListSlotsQuery): Promise<{ slots: SlotWithDetails[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.clinic_id) {
      conditions.push(`s.clinic_id = $${paramIndex++}`);
      params.push(filters.clinic_id);
    }

    if (filters.doctor_name) {
      conditions.push(`s.doctor_name ILIKE $${paramIndex++}`);
      params.push(`%${filters.doctor_name}%`);
    }

    if (filters.status) {
      conditions.push(`s.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.date) {
      conditions.push(`DATE(s.start_time AT TIME ZONE 'UTC') = $${paramIndex++}`);
      params.push(filters.date);
    }

    if (filters.from) {
      conditions.push(`s.start_time >= $${paramIndex++}`);
      params.push(filters.from);
    }

    if (filters.to) {
      conditions.push(`s.end_time <= $${paramIndex++}`);
      params.push(filters.to);
    }

    const whereClause = conditions.join(' AND ');

    // Count total matching
    const countSql = `SELECT COUNT(*) as count FROM slots s WHERE ${whereClause};`;
    const countRes = await query<{ count: string }>(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    // Fetch data joined with clinic name and active booking if any
    const dataSql = `
      SELECT 
        s.*,
        c.name as clinic_name,
        b.id as booking_id,
        b.booking_reference,
        b.patient_name,
        b.patient_email,
        b.patient_phone,
        b.status as booking_status,
        b.created_at as booking_created_at
      FROM slots s
      LEFT JOIN clinics c ON c.id = s.clinic_id
      LEFT JOIN bookings b ON b.slot_id = s.id AND b.status = 'CONFIRMED'
      WHERE ${whereClause}
      ORDER BY s.start_time ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    const dataRes = await query<any>(dataSql, [...params, filters.limit, filters.offset]);

    const slots: SlotWithDetails[] = dataRes.rows.map((row) => ({
      id: row.id,
      clinic_id: row.clinic_id,
      doctor_name: row.doctor_name,
      start_time: row.start_time.toISOString ? row.start_time.toISOString() : new Date(row.start_time).toISOString(),
      end_time: row.end_time.toISOString ? row.end_time.toISOString() : new Date(row.end_time).toISOString(),
      status: row.status,
      created_at: row.created_at.toISOString ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      updated_at: row.updated_at.toISOString ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
      clinic_name: row.clinic_name,
      booking: row.booking_id
        ? {
            id: row.booking_id,
            booking_reference: row.booking_reference,
            patient_name: row.patient_name,
            patient_email: row.patient_email,
            patient_phone: row.patient_phone,
            status: row.booking_status,
            created_at: row.booking_created_at.toISOString ? row.booking_created_at.toISOString() : new Date(row.booking_created_at).toISOString(),
          }
        : null,
    }));

    return { slots, total };
  }
}

export const slotRepository = new SlotRepository();
