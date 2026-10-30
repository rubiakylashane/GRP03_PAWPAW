# Pawpaw Veterinary Clinic

## Run the PostgreSQL-backed application

### Set up a local database and admin account

1. Install PostgreSQL and create a database for the app, for example `grpPawspawt_vetdb`.
2. Copy `server\.env.example` to `server\.env`. Set `DATABASE_URL` (or the `PG*` connection settings), `PORT`, and a private `AUTH_SECRET` of at least 32 characters.
3. Add the admin credentials to your local `server\.env` (choose your own values):

   ```env
   ADMIN_USERNAME=your_admin_username
   ADMIN_EMAIL=you@example.com
   ADMIN_NAME=Your Name
   ADMIN_PASSWORD=your_private_strong_password
   ```

   The admin password must be at least 12 characters and include an uppercase letter, a lowercase letter, a number, and a special character. Do not commit `server\.env` or share its secrets.
4. From the repository root, install the server dependencies, apply the schema, create the admin account, and start the server:

   ```powershell
   npm.cmd --prefix .\server install
   npm.cmd --prefix .\server run migrate
   npm.cmd --prefix .\server run create-admin
   npm.cmd --prefix .\server run dev
   ```

5. Open `http://localhost:5000` and sign in with the username and password you configured.

Each developer using a separate database must configure their own `.env`, migrate their database, and create their own admin account. If the team intentionally shares one database, configure every app to use that same database and run `create-admin` only once for a given admin username. `create-admin` does not change an existing account's password.

The migration expects the clinic's existing schema and tables to be present; use a test database when trying it for the first time. Set `window.PAWPAW_DEMO_MODE = true` before loading the login script only when intentionally using local demo data.