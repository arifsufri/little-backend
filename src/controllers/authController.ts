import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role = 'Staff' } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Name, email, and password are required'
      });
    }

    // Validate role
    const validRoles = ['Boss', 'Staff'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
        message: 'Role must be Boss or Staff'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password too short',
        message: 'Password must be at least 6 characters long'
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        message: 'A user with this email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'Staff', // Always create as Staff
        isActive: false // Require Boss activation
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Don't provide token for inactive staff accounts
    // They need Boss activation first
    res.status(201).json({
      success: true,
      data: {
        user
      },
      message: 'Registration successful! Your account is pending activation by the administrator. Please contact your boss to activate your account.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user',
      message: 'Internal server error'
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Email and password are required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Email not registered',
        message: 'This email is not registered. Please check your email or create an account.'
      });
    }

    // Guard against legacy rows without a password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Wrong password',
        message: 'The password you entered is incorrect. Please try again.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account not activated',
        message: 'Your account is pending activation by the administrator. Please contact your boss.'
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        token
      },
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login',
      message: 'Internal server error'
    });
  }
};

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    // This will be called after authentication middleware
    // req.user will be set by the middleware
    const { user } = req as any;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'User not authenticated'
      });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User data not found'
      });
    }

    res.json({
      success: true,
      data: userData,
      message: 'User data retrieved successfully'
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user data',
      message: 'Internal server error'
    });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { user } = req as any;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'User not authenticated'
      });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password too short',
        message: 'New password must be at least 6 characters long'
      });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.userId }
    });

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User data not found'
      });
    }

    const validCurrentPassword = await bcrypt.compare(currentPassword, userData.password as string);
    
    if (!validCurrentPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.userId },
      data: { password: hashedNewPassword }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      message: 'Internal server error'
    });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: users,
      message: 'Users retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      message: 'Internal server error'
    });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const currentUser = (req as any).user;

    console.log('Current user attempting role update:', {
      id: currentUser?.id,
      role: currentUser?.role,
      targetUserId: userId,
      newRole: role
    });

    // Both Boss and Staff can update roles (for now)
    if (!currentUser?.role || !['Boss', 'Staff'].includes(currentUser.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: `Only Boss and Staff can update user roles. Your current role: ${currentUser?.role || 'undefined'}`,
      });
    }

    // Validate role
    if (!role || !['Boss', 'Staff'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
        message: 'Role must be either Boss or Staff',
      });
    }

    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!userExists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User does not exist',
      });
    }

    // Prevent Boss from demoting themselves if they're the only Boss
    if (currentUser.id === parseInt(userId) && role !== 'Boss') {
      const bossCount = await prisma.user.count({
        where: { role: 'Boss' },
      });

      if (bossCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot demote last Boss',
          message: 'At least one Boss must remain in the system',
        });
      }
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: `User role updated to ${role}`,
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user role',
      message: 'Internal server error',
    });
  }
};

// Temporary endpoint to make current user a Boss (for initial setup)
export const makeMeBoss = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Please log in first',
      });
    }

    // Update current user to Boss role
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: { role: 'Boss' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: 'You are now a Boss! Please refresh and try again.',
    });
  } catch (error) {
    console.error('Make me boss error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update role',
      message: 'Internal server error',
    });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { user } = req as any;
    const { name, email } = req.body;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'User not authenticated'
      });
    }

    // Validate input
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Name and email are required'
      });
    }

    // Check if email is already taken by another user
    if (email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser && existingUser.id !== user.userId) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists',
          message: 'This email is already registered to another account'
        });
      }
    }

    let avatar = null;
    if (req.file) {
      avatar = `/uploads/${req.file.filename}`;
    }

    const updateData: any = { name, email };
    if (avatar) {
      updateData.avatar = avatar;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: { user: updatedUser },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: 'Internal server error'
    });
  }
};

// Toggle user active status (Boss only)
export const toggleUserStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUser = (req as any).user;

    // Only Boss can activate/deactivate users
    if (!currentUser?.role || currentUser.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Only Boss can activate or deactivate user accounts.'
      });
    }

    // Check if user exists
    const userToUpdate = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!userToUpdate) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Prevent Boss from deactivating themselves
    if (userToUpdate.id === currentUser.userId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation',
        message: 'You cannot deactivate your own account'
      });
    }

    // Toggle the active status
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { isActive: !userToUpdate.isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: updatedUser,
      message: `User account ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user status',
      message: 'Internal server error'
    });
  }
};

// Delete user account (Boss only)
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUser = (req as any).user;

    // Only Boss can delete users
    if (!currentUser?.role || currentUser.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Only Boss can delete user accounts.'
      });
    }

    // Check if user exists
    const userToDelete = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Prevent Boss from deleting themselves
    if (userToDelete.id === currentUser.userId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation',
        message: 'You cannot delete your own account'
      });
    }

    // Check if this is the last Boss
    if (userToDelete.role === 'Boss') {
      const bossCount = await prisma.user.count({
        where: { role: 'Boss' }
      });

      if (bossCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete last Boss',
          message: 'Cannot delete the last Boss account. Promote another user to Boss first.'
        });
      }
    }

    // Delete the user
    await prisma.user.delete({
      where: { id: parseInt(userId) }
    });

    res.json({
      success: true,
      message: `User account for ${userToDelete.name} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      message: 'Internal server error'
    });
  }
};

// Boss registration endpoint (auto-activates with Boss role)
export const registerBoss = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Name, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Invalid password',
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        message: 'A user with this email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'Boss', // Always Boss role
        isActive: true // Auto-activate
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      data: {
        user,
        token
      },
      message: 'Boss account created and activated successfully'
    });
  } catch (error) {
    console.error('Boss registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create Boss account',
      message: 'Internal server error'
    });
  }
};

