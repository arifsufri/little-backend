import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

// Import routes
import authRoute from './routes/authRoute';
import userRoute from './routes/userRoute';
import packagesRoute from './routes/packagesRoute';
import clientRoute from './routes/clientRoute';
import appointmentRoute from './routes/appointmentRoute';
import staffRoute from './routes/staffRoute';
import financialRoute from './routes/financialRoute';

// Import middleware
import { errorHandler, notFound } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 4000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: [corsOrigin, 'http://localhost:3000', 'https://little-barbershop.vercel.app'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/auth', authRoute);
app.use('/users', userRoute);
app.use('/packages', packagesRoute);
app.use('/clients', clientRoute);
app.use('/appointments', appointmentRoute);
app.use('/staff', staffRoute);
app.use('/financial', financialRoute);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Little Barbershop API is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/auth',
      users: '/users',
      packages: '/packages',
      clients: '/clients',
      appointments: '/appointments',
      staff: '/staff',
      financial: '/financial'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use(notFound);

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/`);
});
