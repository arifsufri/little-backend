import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getActiveBarbers
} from '../controllers/userController';

const router = express.Router();

// Public routes
router.post('/', createUser);
router.get('/barbers', getActiveBarbers); // Public route for clients to see available barbers

// Protected routes (require authentication)
router.get('/', authenticateToken, getAllUsers);
router.get('/:id', authenticateToken, getUserById);
router.put('/:id', authenticateToken, updateUser);
router.delete('/:id', authenticateToken, deleteUser);

export default router;

