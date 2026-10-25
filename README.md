# DBA_PAWPAW

## Run the integrated app

The Express server serves the frontend and API from the same origin. From `server/`, configure the database values in `.env` (see `.env.example`), then run:

```powershell
npm run migrate
npm start
```

Open `http://localhost:5000/`. The server redirects to the existing login page; its styling and layout remain in `css/`.

Sign-in uses an HTTP-only session cookie backed by a PostgreSQL session table. The cookie contains a random opaque token; only its hash is stored in the database. Sessions expire after eight hours and are revoked on logout or account deactivation.

The migrations in `server/migrations/` are additive: they extend pet/owner/vaccination fields, permit unassigned appointments and the status values used by the UI, and create notification and session tables.

## Create staff, veterinarian, and admin accounts

Role dashboards use the normal authenticated backend. There is no public role
signup and entering a role name with an arbitrary password does not bypass
login. Sign in with an existing administrator account, then create accounts
from the admin dashboard:

- Open **Users and Staff** to create a Staff or Admin account.
- Open **Veterinarians** to create a veterinarian account and profile.
- Choose a unique username and temporary password on the form. After creation,
  the page displays the sign-in details once so they can be shared privately.
- The new user signs in at `http://localhost:5000/pages/auth/login.html` with
  those credentials and is routed to the dashboard for their role.

Passwords are stored as bcrypt hashes. Administrators can reset a user's
password later from the account management screen.