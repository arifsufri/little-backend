import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAllDiscountCodes,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  validateDiscountCode,
  toggleDiscountCodeStatus
} from '../controllers/discountController';

const router = express.Router();


router.post('/validate', validateDiscountCode);

router.get('/', authenticateToken, getAllDiscountCodes);
router.post('/', authenticateToken, createDiscountCode);
router.put('/:id', authenticateToken, updateDiscountCode);
router.patch('/:id/toggle-status', authenticateToken, toggleDiscountCodeStatus);
router.delete('/:id', authenticateToken, deleteDiscountCode);

export default router;
