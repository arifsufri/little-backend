import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import {
  register,
  login,
  getCurrentUser,
  changePassword,
  updateProfile,
  getAllUsers,
  updateUserRole,
  makeMeBoss,
  toggleUserStatus,
  deleteUser,
  registerBoss
} from '../controllers/authController';

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for avatar upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Public routes
router.post('/register', register);
router.post('/register-boss', registerBoss); // Secret Boss registration
router.post('/login', login);

// Protected routes (require authentication)
router.get('/me', authenticateToken, getCurrentUser);
router.get('/users', authenticateToken, getAllUsers);
router.put('/users/:userId/role', authenticateToken, updateUserRole);
router.put('/users/:userId/status', authenticateToken, toggleUserStatus);
router.delete('/users/:userId', authenticateToken, deleteUser);
router.post('/make-me-boss', authenticateToken, makeMeBoss);
router.post('/change-password', authenticateToken, changePassword);
router.put('/profile', authenticateToken, upload.single('avatar'), updateProfile);

export default router;

