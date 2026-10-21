import { query } from './client';

export async function seedDatabase() {
  console.log('🌱 Seeding database...');

  // 1. Insert Clinics
  await query(`
    INSERT INTO clinics (id, name, email, phone, address)
    VALUES 
      ('clinic-central', 'Central Metro Health Clinic', 'appointments@centralhealth.com', '+1-555-0101', '100 Medical Center Blvd, Suite 200'),
      ('clinic-horizon', 'Horizon Wellness & Family Care', 'care@horizonclinic.org', '+1-555-0102', '450 University Ave, Fl 4'),
      ('clinic-apex', 'Apex Dental & Specialty Clinic', 'frontdesk@apexdental.io', '+1-555-0103', '789 Skyline Parkway')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address;
  `);

  console.log('✅ Seeded 3 clinics.');

  // 2. Check existing slots count
  const existingSlots = await query('SELECT count(*) FROM slots');
  const count = parseInt(existingSlots.rows[0].count, 10);

  if (count === 0) {
    // Generate dates for tomorrow and the next few days
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const slotData = [
      {
        clinic_id: 'clinic-central',
        doctor: 'Dr. Sarah Jenkins (Cardiology)',
        offsetHours: 0,
        durationMinutes: 30,
      },
      {
        clinic_id: 'clinic-central',
        doctor: 'Dr. Sarah Jenkins (Cardiology)',
        offsetHours: 0.75,
        durationMinutes: 30,
      },
      {
        clinic_id: 'clinic-central',
        doctor: 'Dr. Alex Rivera (General Medicine)',
        offsetHours: 1.5,
        durationMinutes: 45,
      },
      {
        clinic_id: 'clinic-horizon',
        doctor: 'Dr. Emily Watson (Pediatrics)',
        offsetHours: 2.5,
        durationMinutes: 30,
      },
      {
        clinic_id: 'clinic-horizon',
        doctor: 'Dr. Emily Watson (Pediatrics)',
        offsetHours: 3.25,
        durationMinutes: 30,
      },
      {
        clinic_id: 'clinic-apex',
        doctor: 'Dr. Michael Chen (Orthodontics)',
        offsetHours: 4.5,
        durationMinutes: 45,
      },
    ];

    for (const item of slotData) {
      const start = new Date(tomorrow.getTime() + item.offsetHours * 60 * 60 * 1000);
      const end = new Date(start.getTime() + item.durationMinutes * 60 * 1000);

      await query(
        `INSERT INTO slots (clinic_id, doctor_name, start_time, end_time, status)
         VALUES ($1, $2, $3, $4, 'AVAILABLE')`,
        [item.clinic_id, item.doctor, start.toISOString(), end.toISOString()]
      );
    }

    console.log(`✅ Seeded ${slotData.length} initial appointment slots.`);
  } else {
    console.log(`ℹ️ Slots already exist (${count} slots found). Skipping slot seed.`);
  }

  return true;
}

if (require.main === module || process.argv[1]?.includes('seed')) {
  seedDatabase()
    .then(() => {
      console.log('Seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}
