import { query } from '../db/client';
import { Clinic } from '../types';
import { NotFoundError } from '../errors/app-error';

export class ClinicService {
  async listClinics(): Promise<Clinic[]> {
    const res = await query<Clinic>('SELECT * FROM clinics ORDER BY name ASC;');
    return res.rows;
  }

  async getClinic(id: string): Promise<Clinic> {
    const res = await query<Clinic>('SELECT * FROM clinics WHERE id = $1;', [id]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Clinic with ID "${id}" was not found`, 'CLINIC_NOT_FOUND');
    }
    return res.rows[0];
  }
}

export const clinicService = new ClinicService();
