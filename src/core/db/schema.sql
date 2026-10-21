-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clinics Table
CREATE TABLE IF NOT EXISTS clinics (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Slots Table
CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doctor_name VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_end_after_start CHECK (end_time > start_time)
);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference VARCHAR(32) UNIQUE NOT NULL,
  slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE RESTRICT,
  patient_name VARCHAR(255) NOT NULL,
  patient_email VARCHAR(255) NOT NULL,
  patient_phone VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

-- Performance and Filter Indexes
CREATE INDEX IF NOT EXISTS idx_slots_clinic_start ON slots(clinic_id, start_time);
CREATE INDEX IF NOT EXISTS idx_slots_status ON slots(status);
CREATE INDEX IF NOT EXISTS idx_slots_start_time ON slots(start_time);
CREATE INDEX IF NOT EXISTS idx_slots_doctor ON slots(doctor_name);

CREATE INDEX IF NOT EXISTS idx_bookings_patient_email ON bookings(patient_email);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- CRITICAL CONCURRENCY INTEGRITY:
-- Partial unique index ensuring that under no circumstances can two CONFIRMED bookings exist for the same slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_booking_per_slot 
ON bookings (slot_id) 
WHERE status = 'CONFIRMED';
