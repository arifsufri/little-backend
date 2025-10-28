import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
  togglePackageStatus
} from '../controllers/packageController';

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Public routes
router.get('/', getAllPackages);
router.get('/:id', getPackageById);

// Protected routes (require authentication)
router.post('/', authenticateToken, upload.single('image'), createPackage);
router.put('/:id', authenticateToken, upload.single('image'), updatePackage);
router.patch('/:id/toggle-status', authenticateToken, togglePackageStatus);
router.delete('/:id', authenticateToken, deletePackage);

export default router;

