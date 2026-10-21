import { z } from 'zod';

export const CreateSlotSchema = z
  .object({
    clinic_id: z.string().min(1, 'clinic_id is required').max(64),
    doctor_name: z.string().min(2, 'doctor_name must be at least 2 characters').max(255),
    start_time: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'start_time must be a valid ISO 8601 date string (e.g. 2026-10-25T09:00:00Z)',
    }),
    end_time: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'end_time must be a valid ISO 8601 date string (e.g. 2026-10-25T09:30:00Z)',
    }),
  })
  .refine(
    (data) => {
      const start = new Date(data.start_time).getTime();
      const end = new Date(data.end_time).getTime();
      return end > start;
    },
    {
      message: 'end_time must be strictly after start_time',
      path: ['end_time'],
    }
  );

export const CreateSlotsBatchSchema = z.union([
  CreateSlotSchema,
  z.array(CreateSlotSchema).min(1, 'Array of slots must contain at least 1 slot'),
]);

export const ListSlotsQuerySchema = z.object({
  clinic_id: z.string().optional(),
  doctor_name: z.string().optional(),
  status: z.enum(['AVAILABLE', 'BOOKED', 'CANCELLED']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateSlotInput = z.infer<typeof CreateSlotSchema>;
export type ListSlotsQuery = z.infer<typeof ListSlotsQuerySchema>;
