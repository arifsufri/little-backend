import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Get all discount codes (Boss only)
export const getAllDiscountCodes = async (req: AuthRequest, res: Response) => {
  try {

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss role can view discount codes'
      });
    }

    const discountCodes = await prisma.discountCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        usages: {
          include: {
            client: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true
              }
            }
          }
        },
        _count: {
          select: {
            usages: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: discountCodes,
      message: 'Discount codes retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching discount codes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch discount codes',
      message: 'Internal server error'
    });
  }
};

// Create discount code (Boss only)
export const createDiscountCode = async (req: AuthRequest, res: Response) => {
  try {
    const { code, description, discountType, discountPercent, discountAmount, applicablePackages } = req.body;

    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss role can create discount codes'
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Code is required'
      });
    }

    // Validate discount type and values
    const type = discountType || 'percentage';
    if (!['percentage', 'fixed_amount'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount type',
        message: 'Discount type must be either "percentage" or "fixed_amount"'
      });
    }

    if (type === 'percentage') {
      if (!discountPercent || discountPercent < 0 || discountPercent > 100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid discount percentage',
          message: 'Discount percentage must be between 0 and 100'
        });
      }
    } else if (type === 'fixed_amount') {
      if (!discountAmount || discountAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid discount amount',
          message: 'Discount amount must be greater than 0'
        });
      }
    }

    // Check if code already exists
    const existingCode = await prisma.discountCode.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (existingCode) {
      return res.status(400).json({
        success: false,
        error: 'Code already exists',
        message: 'A discount code with this name already exists'
      });
    }

    const discountCode = await prisma.discountCode.create({
      data: {
        code: code.toUpperCase(),
        description: description || null,
        discountType: type,
        discountPercent: type === 'percentage' ? parseFloat(discountPercent) : null,
        discountAmount: type === 'fixed_amount' ? parseFloat(discountAmount) : null,
        applicablePackages: applicablePackages || [],
        createdBy: req.user!.userId
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            usages: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: discountCode,
      message: 'Discount code created successfully'
    });
  } catch (error) {
    console.error('Error creating discount code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create discount code',
      message: 'Internal server error'
    });
  }
};

// Update discount code (Boss only)
export const updateDiscountCode = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { code, description, discountType, discountPercent, discountAmount, isActive, applicablePackages } = req.body;
    const discountCodeId = parseInt(id);

    if (isNaN(discountCodeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount code ID',
        message: 'Discount code ID must be a number'
      });
    }

    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss role can update discount codes'
      });
    }

    const existingCode = await prisma.discountCode.findUnique({
      where: { id: discountCodeId }
    });

    if (!existingCode) {
      return res.status(404).json({
        success: false,
        error: 'Discount code not found',
        message: 'No discount code found with the specified ID'
      });
    }

    // Check if new code name conflicts with existing codes
    if (code && code.toUpperCase() !== existingCode.code) {
      const codeConflict = await prisma.discountCode.findUnique({
        where: { code: code.toUpperCase() }
      });

      if (codeConflict) {
        return res.status(400).json({
          success: false,
          error: 'Code already exists',
          message: 'A discount code with this name already exists'
        });
      }
    }

    // Validate discount type and values if provided
    if (discountType && !['percentage', 'fixed_amount'].includes(discountType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount type',
        message: 'Discount type must be either "percentage" or "fixed_amount"'
      });
    }

    if (discountPercent !== undefined && (discountPercent < 0 || discountPercent > 100)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount percentage',
        message: 'Discount percentage must be between 0 and 100'
      });
    }

    if (discountAmount !== undefined && discountAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount amount',
        message: 'Discount amount must be greater than 0'
      });
    }

    const updatedCode = await prisma.discountCode.update({
      where: { id: discountCodeId },
      data: {
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
        ...(discountType && { discountType }),
        ...(discountPercent !== undefined && { discountPercent: parseFloat(discountPercent) }),
        ...(discountAmount !== undefined && { discountAmount: parseFloat(discountAmount) }),
        ...(isActive !== undefined && { isActive }),
        ...(applicablePackages !== undefined && { applicablePackages })
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            usages: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: updatedCode,
      message: 'Discount code updated successfully'
    });
  } catch (error) {
    console.error('Error updating discount code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update discount code',
      message: 'Internal server error'
    });
  }
};

// Delete discount code (Boss only)
export const deleteDiscountCode = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const discountCodeId = parseInt(id);

    if (isNaN(discountCodeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount code ID',
        message: 'Discount code ID must be a number'
      });
    }

    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss role can delete discount codes'
      });
    }

    const existingCode = await prisma.discountCode.findUnique({
      where: { id: discountCodeId },
      include: {
        _count: {
          select: {
            usages: true
          }
        }
      }
    });

    if (!existingCode) {
      return res.status(404).json({
        success: false,
        error: 'Discount code not found',
        message: 'No discount code found with the specified ID'
      });
    }

    // Check if code has been used
    if (existingCode._count.usages > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete used discount code',
        message: 'This discount code has been used and cannot be deleted. You can deactivate it instead.'
      });
    }

    await prisma.discountCode.delete({
      where: { id: discountCodeId }
    });

    res.json({
      success: true,
      message: 'Discount code deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting discount code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete discount code',
      message: 'Internal server error'
    });
  }
};

// Validate and apply discount code
export const validateDiscountCode = async (req: Request, res: Response) => {
  try {
    const { code, clientId } = req.body;

    if (!code || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Code and client ID are required'
      });
    }

    // Find the discount code
    const discountCode = await prisma.discountCode.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        usages: {
          where: {
            clientId: parseInt(clientId)
          }
        }
      }
    });

    if (!discountCode) {
      return res.status(404).json({
        success: false,
        error: 'Invalid discount code',
        message: 'The discount code you entered is not valid'
      });
    }

    if (!discountCode.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Discount code inactive',
        message: 'This discount code is no longer active'
      });
    }

    // Note: Discount codes can now be used multiple times by the same client

    res.json({
      success: true,
      data: {
        id: discountCode.id,
        code: discountCode.code,
        description: discountCode.description,
        discountType: discountCode.discountType,
        discountPercent: discountCode.discountPercent,
        discountAmount: discountCode.discountAmount
      },
      message: 'Discount code is valid'
    });
  } catch (error) {
    console.error('Error validating discount code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate discount code',
      message: 'Internal server error'
    });
  }
};

// Toggle discount code status (Boss only)
export const toggleDiscountCodeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const discountCodeId = parseInt(id);

    if (isNaN(discountCodeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount code ID',
        message: 'Discount code ID must be a number'
      });
    }

    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss role can toggle discount code status'
      });
    }

    const existingCode = await prisma.discountCode.findUnique({
      where: { id: discountCodeId }
    });

    if (!existingCode) {
      return res.status(404).json({
        success: false,
        error: 'Discount code not found',
        message: 'No discount code found with the specified ID'
      });
    }

    const updatedCode = await prisma.discountCode.update({
      where: { id: discountCodeId },
      data: {
        isActive: !existingCode.isActive
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            usages: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: updatedCode,
      message: `Discount code ${updatedCode.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling discount code status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle discount code status',
      message: 'Internal server error'
    });
  }
};
