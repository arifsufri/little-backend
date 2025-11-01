import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createAppointment,
  getAllAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  editAppointment,
  deleteAppointment,
  getClientAppointments
} from '../controllers/appointmentController';

const router = express.Router();

// Public routes - clients can create appointments without admin auth
router.post('/', createAppointment);
router.get('/client/:clientId', getClientAppointments);

// Protected routes - require authentication for admin access
router.get('/', authenticateToken, getAllAppointments);
router.get('/:id', authenticateToken, getAppointmentById);
router.put('/:id', authenticateToken, updateAppointmentStatus);
router.patch('/:id', authenticateToken, editAppointment);
router.delete('/:id', authenticateToken, deleteAppointment);

export default router;
