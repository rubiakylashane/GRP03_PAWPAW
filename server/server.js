const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');
const authRoutes = require('./routes/auth');
const petRoutes = require('./routes/pets');
const appointmentRoutes = require('./routes/appointments');
const medicalRecordsRoutes = require('./routes/medicalRecords');
const vaccinationRoutes = require('./routes/vaccinations');
const serviceRoutes = require('./routes/services');
const accountRoutes = require('./routes/account');
const notificationRoutes = require('./routes/notifications');
const prescriptionRoutes = require('./routes/prescriptions');
const veterinarianRoutes = require('./routes/veterinarians');
const ownerRoutes = require('./routes/owners');
const adminRoutes = require('./routes/admin');
const { requireSession } = require('./middleware/session');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '7mb' }));
app.use(cors());

const frontendRoot = path.resolve(__dirname, '..');

// Health check endpoint verifying DB connection
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ status: 'success', dbTime: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', requireSession);
app.use('/api', accountRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/veterinarians', veterinarianRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medical-records', medicalRecordsRoutes);
app.use('/api/vaccinations', vaccinationRoutes);
app.use('/api/services', serviceRoutes);

app.get('/', (req, res) => {
  res.redirect('/pages/auth/login.html');
});

for (const directory of ['assets', 'css', 'js', 'pages']) {
  app.use(`/${directory}`, express.static(path.join(frontendRoot, directory)));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Pawpaw backend server running on port ${PORT}`);
});