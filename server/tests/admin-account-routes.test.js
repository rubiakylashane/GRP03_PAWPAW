import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const db = require('../config/db');
const activity = require('../services/activity');

const originalConnect = db.connect;
const originalWriteAudit = activity.writeAudit;
activity.writeAudit = async () => {};
const adminRouter = require('../routes/admin');
activity.writeAudit = originalWriteAudit;

function postHandler(path) {
  const layer = adminRouter.stack.find((entry) => entry.route && entry.route.path === path && entry.route.methods.post);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createClient({ duplicate = {}, accountRole = 'Staff' } = {}) {
  const queries = [];
  const client = {
    queries,
    async query(sql, params = []) {
      const statement = sql.trim();
      queries.push({ statement, params });
      if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') return { rows: [] };
      if (statement.startsWith('SELECT EXISTS')) {
        return { rows: [{ username_taken: false, email_taken: false, license_taken: false, ...duplicate }] };
      }
      if (statement.startsWith('INSERT INTO user_account')) {
        return {
          rows: [{
            id: 71,
            user_id: 71,
            username: params[0],
            email: params[2],
            role: accountRole,
            status: 'Active',
            createdAt: new Date('2025-01-01T00:00:00.000Z')
          }]
        };
      }
      if (statement.startsWith('INSERT INTO veterinarian')) {
        return {
          rows: [{
            id: 91,
            name: params[1],
            specialization: params[2],
            license: params[3],
            phone: params[4],
            email: params[5],
            userId: params[0]
          }]
        };
      }
      throw new Error(`Unexpected account creation query: ${statement}`);
    },
    release() {}
  };
  return client;
}

async function invoke(handler, body) {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
  await handler({ body, auth: { userId: 4 } }, response);
  return response;
}

afterEach(() => {
  db.connect = originalConnect;
});

describe('admin account creation routes', () => {
  it('creates a staff account with a normalized username and hashed password', async () => {
    const client = createClient();
    db.connect = async () => client;

    const response = await invoke(postHandler('/users'), {
      name: 'Clinic Staff',
      username: 'New_Staff',
      phone: '09123456789',
      email: 'staff@example.com',
      password: 'temporary-pass',
      role: 'staff'
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.user.username).toBe('new_staff');
    const insert = client.queries.find((entry) => entry.statement.startsWith('INSERT INTO user_account'));
    expect(insert.params[1]).not.toBe('temporary-pass');
    expect(insert.params[2]).toBe('Staff');
    expect(client.queries.some((entry) => entry.statement === 'COMMIT')).toBe(true);
  });

  it('creates the veterinarian account and profile together', async () => {
    const client = createClient({ accountRole: 'Veterinarian' });
    db.connect = async () => client;

    const response = await invoke(postHandler('/veterinarians'), {
      name: 'Dr. Clinic Vet',
      username: 'New_Vet',
      phone: '09123456789',
      email: 'vet@example.com',
      license: 'PRC 0012345',
      specialization: 'General Practice',
      password: 'temporary-pass'
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.veterinarian.username).toBe('new_vet');
    expect(client.queries.some((entry) => entry.statement.startsWith('INSERT INTO user_account'))).toBe(true);
    expect(client.queries.some((entry) => entry.statement.startsWith('INSERT INTO veterinarian'))).toBe(true);
    expect(client.queries.some((entry) => entry.statement === 'COMMIT')).toBe(true);
  });

  it('rejects a duplicate username and rolls back without inserting an account', async () => {
    const client = createClient({ duplicate: { username_taken: true } });
    db.connect = async () => client;

    const response = await invoke(postHandler('/users'), {
      name: 'Clinic Staff',
      username: 'Existing_Staff',
      phone: '09123456789',
      email: 'new-staff@example.com',
      password: 'temporary-pass',
      role: 'staff'
    });

    expect(response.statusCode).toBe(409);
    expect(response.body.error).toMatch(/username/i);
    expect(client.queries.some((entry) => entry.statement === 'ROLLBACK')).toBe(true);
    expect(client.queries.some((entry) => entry.statement.startsWith('INSERT INTO user_account'))).toBe(false);
  });
});
