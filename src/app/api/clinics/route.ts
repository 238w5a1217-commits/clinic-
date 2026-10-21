import { NextRequest, NextResponse } from 'next/server';
import { clinicService } from '@/core/services/clinic.service';
import { handleApiError } from '@/core/errors/error-handler';
import { query } from '@/core/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clinics
 * List all registered clinics
 */
export async function GET() {
  try {
    const clinics = await clinicService.listClinics();
    return NextResponse.json(
      {
        success: true,
        data: clinics,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/clinics
 * Register a new clinic
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, email, phone, address } = body;

    if (!id || !name) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Both id and name are required to register a clinic.',
          },
        },
        { status: 400 }
      );
    }

    const res = await query(
      `INSERT INTO clinics (id, name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address
       RETURNING *;`,
      [id, name, email || null, phone || null, address || null]
    );

    return NextResponse.json(
      {
        success: true,
        data: res.rows[0],
        message: 'Clinic registered successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
