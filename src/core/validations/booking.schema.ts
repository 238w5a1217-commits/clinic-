import { z } from 'zod';

export const CreateBookingSchema = z.object({
  patient_name: z
    .string()
    .trim()
    .min(2, 'patient_name must be at least 2 characters')
    .max(255, 'patient_name must not exceed 255 characters'),
  patient_email: z
    .string()
    .trim()
    .email('patient_email must be a valid email address')
    .toLowerCase(),
  patient_phone: z
    .string()
    .trim()
    .min(5, 'patient_phone must be at least 5 characters')
    .max(50, 'patient_phone must not exceed 50 characters'),
  notes: z.string().max(1000, 'notes cannot exceed 1000 characters').optional().nullable(),
});

export const DirectBookingSchema = CreateBookingSchema.extend({
  slot_id: z.string().uuid('slot_id must be a valid UUID'),
});

export const ListBookingsQuerySchema = z.object({
  clinic_id: z.string().optional(),
  patient_email: z.string().email().optional(),
  status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type DirectBookingInput = z.infer<typeof DirectBookingSchema>;
export type ListBookingsQuery = z.infer<typeof ListBookingsQuerySchema>;
