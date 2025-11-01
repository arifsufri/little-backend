import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  registerClient,
  loginClient,
  getAllClients,
  getClientById
} from '../controllers/clientController';

const router = express.Router();

router.post('/register', registerClient);
router.post('/login', loginClient);

router.get('/', authenticateToken, getAllClients);
router.get('/:id', authenticateToken, getClientById);

export default router;
