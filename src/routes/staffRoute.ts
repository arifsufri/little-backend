import express from 'express';
import {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  toggleStaffStatus
} from '../controllers/staffController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, getAllStaff);
router.get('/:id', authenticateToken, getStaffById);
router.post('/', authenticateToken, createStaff);
router.put('/:id', authenticateToken, updateStaff);
router.delete('/:id', authenticateToken, deleteStaff);
router.patch('/:id/toggle-status', authenticateToken, toggleStaffStatus);

export default router;

