const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/db');

async function seed() {
  let client;
  let transactionStarted = false;
  const credentials = [];

  async function ensureUser(username, role, displayName, email) {
    const existing = await client.query(
      `SELECT user_id, role
       FROM accounts.user_account
       WHERE username = $1`,
      [username]
    );

    if (existing.rows.length) {
      if (existing.rows[0].role !== role) {
        throw new Error(`Username "${username}" already has a different role.`);
      }

      return existing.rows[0].user_id;
    }

    const password = crypto.randomBytes(18).toString('base64url');
    const hash = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO accounts.user_account
         (username, password_hash, role, email, display_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id`,
      [username, hash, role, email, displayName]
    );

    credentials.push({ username, role, password });
    return result.rows[0].user_id;
  }

  async function ensureOwner(userId, firstName, lastName, email, phone, address) {
    const result = await client.query(
      `INSERT INTO accounts.owner
         (user_id, name, email, phone, address, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        userId,
        `${firstName} ${lastName}`,
        email,
        phone,
        address,
        firstName,
        lastName
      ]
    );

    const owner = await client.query(
      'SELECT owner_id FROM accounts.owner WHERE user_id = $1',
      [userId]
    );

    return owner.rows[0].owner_id;
  }

  async function ensurePet(ownerId, name, species, breed, birthDate, gender) {
    const existing = await client.query(
      `SELECT pet_id FROM clinic.pet
       WHERE owner_id = $1 AND name = $2`,
      [ownerId, name]
    );

    if (existing.rows.length) return existing.rows[0].pet_id;

    const result = await client.query(
      `INSERT INTO clinic.pet
         (owner_id, name, species, breed, date_of_birth, gender)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING pet_id`,
      [ownerId, name, species, breed, birthDate, gender]
    );

    return result.rows[0].pet_id;
  }

  async function ensureService(name, price, description) {
    await client.query(
      `INSERT INTO clinic.service (service_name, price, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (service_name) DO NOTHING`,
      [name, price, description]
    );

    const result = await client.query(
      'SELECT service_id FROM clinic.service WHERE service_name = $1',
      [name]
    );

    return result.rows[0].service_id;
  }

  async function ensureAppointment(
    petId, vetId, daysFromToday, time, reason, status, serviceId
  ) {
    const existing = await client.query(
      `SELECT appointment_id
       FROM clinic.appointment
       WHERE pet_id = $1 AND reason = $2`,
      [petId, reason]
    );

    // Preserve previously seeded appointments, including later user edits.
    if (existing.rows.length) return existing.rows[0].appointment_id;

    const result = await client.query(
      `INSERT INTO clinic.appointment
         (pet_id, veterinarian_id, appointment_date,
          appointment_time, reason, status)
       VALUES ($1, $2, CURRENT_DATE + $3::integer, $4, $5, $6)
       RETURNING appointment_id`,
      [petId, vetId, daysFromToday, time, reason, status]
    );

    const appointmentId = result.rows[0].appointment_id;

    await client.query(
      `INSERT INTO clinic.appointment_service
         (appointment_id, service_id, quantity)
       VALUES ($1, $2, 1)`,
      [appointmentId, serviceId]
    );

    return appointmentId;
  }

  try {
    client = await db.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    // Prevent two copies of this seed script from running simultaneously.
    await client.query('SELECT pg_advisory_xact_lock(704221)');

    const admin = await client.query(
      `SELECT username
       FROM accounts.user_account
       WHERE role = 'Admin' AND account_status = 'Active'
       LIMIT 1`
    );

    if (admin.rows.length) {
      console.log(
        `Keeping existing admin "${admin.rows[0].username}" and its password.`
      );
    } else {
      const username = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';

      const occupied = await client.query(
        'SELECT 1 FROM accounts.user_account WHERE username = $1',
        [username]
      );

      if (occupied.rows.length) {
        throw new Error(
          `Username "${username}" is occupied. Choose another BOOTSTRAP_ADMIN_USERNAME.`
        );
      }

      await ensureUser(
        username,
        'Admin',
        'Clinic Administrator',
        null
      );
    }

    const mariaUser = await ensureUser(
      'demo_maria',
      'Pet Owner',
      'Maria Santos',
      'maria.santos@example.com'
    );

    const carloUser = await ensureUser(
      'demo_carlo',
      'Pet Owner',
      'Carlo Reyes',
      'carlo.reyes@example.com'
    );

    const vetUser = await ensureUser(
      'demo_vet_ana',
      'Veterinarian',
      'Dr. Ana Cruz',
      'ana.cruz@example.com'
    );

    await ensureUser(
      'demo_staff_liza',
      'Staff',
      'Liza Mendoza',
      'liza.mendoza@example.com'
    );

    const mariaOwner = await ensureOwner(
      mariaUser,
      'Maria',
      'Santos',
      'maria.santos@example.com',
      '09000000001',
      'Sample address, San Pedro, Laguna'
    );

    const carloOwner = await ensureOwner(
      carloUser,
      'Carlo',
      'Reyes',
      'carlo.reyes@example.com',
      '09000000002',
      'Sample address, Biñan, Laguna'
    );

    await client.query(
      `INSERT INTO accounts.veterinarian
         (user_id, name, specialization, phone, email, license_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        vetUser,
        'Dr. Ana Cruz',
        'Small Animal Medicine',
        '09000000003',
        'ana.cruz@example.com',
        'DEMO-LICENSE-001'
      ]
    );

    const vet = await client.query(
      `SELECT veterinarian_id
       FROM accounts.veterinarian
       WHERE user_id = $1`,
      [vetUser]
    );

    const vetId = vet.rows[0].veterinarian_id;

    const buddy = await ensurePet(
      mariaOwner, 'Buddy', 'Dog', 'Labrador Retriever', '2022-05-10', 'Male'
    );

    const luna = await ensurePet(
      mariaOwner, 'Luna', 'Cat', 'Domestic Shorthair', '2023-08-15', 'Female'
    );

    const coco = await ensurePet(
      carloOwner, 'Coco', 'Dog', 'Shih Tzu', '2021-11-20', 'Female'
    );

    // Sample prices only. Existing service prices are retained.
    const consultation = await ensureService(
      'General Consultation', 500, 'General examination and health assessment.'
    );

    await ensureService(
      'Vaccination', 350, 'Vaccination service following veterinary assessment.'
    );

    await ensureService(
      'Deworming', 250, 'Parasite control following veterinary assessment.'
    );

    const grooming = await ensureService(
      'Grooming', 600, 'Bath, brushing, nail trimming, and ear cleaning.'
    );

    await ensureAppointment(
      buddy,
      null,
      2,
      '09:00',
      '[DEMO-001] Routine wellness examination',
      'Pending',
      consultation
    );

    await ensureAppointment(
      luna,
      vetId,
      3,
      '10:00',
      '[DEMO-002] General health assessment',
      'Approved',
      consultation
    );

    await ensureAppointment(
      coco,
      null,
      4,
      '14:00',
      '[DEMO-003] Grooming appointment',
      'Pending',
      grooming
    );

    const completedId = await ensureAppointment(
      buddy,
      vetId,
      -7,
      '11:00',
      '[DEMO-004] Completed routine checkup',
      'Completed',
      consultation
    );

    await client.query(
      `INSERT INTO medical.medical_record
         (appointment_id, diagnosis, treatment, notes, record_date)
       SELECT appointment_id,
              'Fictional sample: no abnormal findings recorded.',
              'Routine examination completed.',
              'Demonstration record only; not clinical advice.',
              appointment_date
       FROM clinic.appointment
       WHERE appointment_id = $1
       ON CONFLICT (appointment_id) DO NOTHING`,
      [completedId]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    console.log('Sample data seeded successfully.');

    if (credentials.length) {
      console.log('\nNew accounts — save these passwords privately:');

      for (const account of credentials) {
        console.log(`\nRole: ${account.role}`);
        console.log(`Username: ${account.username}`);
        console.log(`Password: ${account.password}`);
      }
    } else {
      console.log('Existing accounts were kept; no passwords were changed.');
    }
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK');
    }

    throw error;
  } finally {
    if (client) client.release();
    await db.end();
  }
}

seed().catch((error) => {
  console.error('Database seed failed:', error.message);
  process.exitCode = 1;
});