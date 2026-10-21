export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'CANCELLED';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

export interface Clinic {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface Slot {
  id: string;
  clinic_id: string;
  doctor_name: string;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  created_at: string;
  updated_at: string;
}

export interface SlotWithDetails extends Slot {
  clinic_name?: string;
  booking?: {
    id: string;
    booking_reference: string;
    patient_name: string;
    patient_email: string;
    patient_phone: string;
    status: BookingStatus;
    created_at: string;
  } | null;
}

export interface Booking {
  id: string;
  booking_reference: string;
  slot_id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  status: BookingStatus;
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
}

export interface BookingWithSlot extends Booking {
  slot: Slot;
  clinic?: Clinic;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
}
