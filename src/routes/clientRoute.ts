import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  registerClient,
  loginClient,
  getAllClients,
  getClientById
} from '../controllers/clientController';

const router = express.Router();

// Public routes - no authentication required for client onboarding and login
router.post('/register', registerClient);
router.post('/login', loginClient);

// Protected routes - require authentication for admin access
router.get('/', authenticateToken, getAllClients);
router.get('/:id', authenticateToken, getClientById);

export default router;
