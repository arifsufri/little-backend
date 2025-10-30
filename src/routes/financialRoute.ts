import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getFinancialOverview,
  getStaffFinancialReport,
  updateCommissionRate,
  addExpense,
  getExpenses,
  deleteExpense
} from '../controllers/financialController';

const router = express.Router();

router.get('/overview', authenticateToken, getFinancialOverview);
router.get('/staff-report', authenticateToken, getStaffFinancialReport);
router.patch('/commission/:staffId', authenticateToken, updateCommissionRate);
router.get('/expenses', authenticateToken, getExpenses);
router.post('/expenses', authenticateToken, addExpense);
router.delete('/expenses/:id', authenticateToken, deleteExpense);

export default router;
