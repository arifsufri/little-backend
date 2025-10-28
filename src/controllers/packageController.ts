import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export const getAllPackages = async (req: Request, res: Response) => {
  try {
    const packages = await prisma.package.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: packages,
      message: 'Packages retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch packages',
      message: 'Internal server error'
    });
  }
};

export const getPackageById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const packageId = parseInt(id);

    if (isNaN(packageId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package ID',
        message: 'Package ID must be a number'
      });
    }

    const packageData = await prisma.package.findUnique({
      where: { id: packageId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!packageData) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
        message: 'No package found with the specified ID'
      });
    }

    res.json({
      success: true,
      data: packageData,
      message: 'Package retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch package',
      message: 'Internal server error'
    });
  }
};

export const createPackage = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, price, barber, duration, discountCode } = req.body;
    
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss role can create packages'
      });
    }
    
    if (!name || !description || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Name, description, and price are required'
      });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const packageData = await prisma.package.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        barber: barber || null,
        duration: parseInt(duration) || 30,
        discountCode: discountCode || null,
        imageUrl,
        createdBy: req.user!.userId
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: packageData,
      message: 'Package created successfully'
    });
  } catch (error) {
    console.error('Error creating package:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create package',
      message: 'Internal server error'
    });
  }
};

export const updatePackage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const packageId = parseInt(id);
    const { name, description, price, barber, duration, discountCode } = req.body;

    if (isNaN(packageId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package ID',
        message: 'Package ID must be a number'
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
        message: 'Only Boss role can update packages'
      });
    }

    if (!name && !description && !price && !barber && !duration && !discountCode && !req.file) {
      return res.status(400).json({
        success: false,
        error: 'No update data provided',
        message: 'At least one field must be provided for update'
      });
    }

    const existingPackage = await prisma.package.findUnique({
      where: { id: packageId }
    });

    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
        message: 'No package found with the specified ID'
      });
    }

    let imageUrl = existingPackage.imageUrl;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const updatedPackage = await prisma.package.update({
      where: { id: packageId },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(price && { price: parseFloat(price) }),
        ...(barber !== undefined && { barber }),
        ...(duration && { duration: parseInt(duration) }),
        ...(discountCode !== undefined && { discountCode }),
        ...(req.file && { imageUrl })
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: updatedPackage,
      message: 'Package updated successfully'
    });
  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update package',
      message: 'Internal server error'
    });
  }
};

export const deletePackage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const packageId = parseInt(id);

    if (isNaN(packageId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package ID',
        message: 'Package ID must be a number'
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
        message: 'Only Boss role can delete packages'
      });
    }

    const existingPackage = await prisma.package.findUnique({
      where: { id: packageId }
    });

    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
        message: 'No package found with the specified ID'
      });
    }

    await prisma.package.delete({
      where: { id: packageId }
    });

    res.json({
      success: true,
      message: 'Package deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete package',
      message: 'Internal server error'
    });
  }
};

export const togglePackageStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const packageId = parseInt(id);

    if (isNaN(packageId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package ID',
        message: 'Package ID must be a number'
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
        message: 'Only Boss role can toggle package status'
      });
    }

    const existingPackage = await prisma.package.findUnique({
      where: { id: packageId }
    });

    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
        message: 'No package found with the specified ID'
      });
    }

    const updatedPackage = await prisma.package.update({
      where: { id: packageId },
      data: {
        isActive: !existingPackage.isActive
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: updatedPackage,
      message: `Package ${updatedPackage.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling package status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle package status',
      message: 'Internal server error'
    });
  }
};

