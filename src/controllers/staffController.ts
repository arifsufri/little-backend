import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Get all staff members (Boss and Staff roles)
export const getAllStaff = async (req: Request, res: Response) => {
  try {
    const staff = await prisma.user.findMany({
      where: {
        role: {
          in: ['Boss', 'Staff']
        }
        // Show all staff (active and inactive) so Boss can manage them
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        commissionRate: true,
        createdAt: true,
        avatar: true,
        barberAppointments: {
          select: {
            id: true,
            status: true,
            finalPrice: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform data to match frontend expectations
    const transformedStaff = staff.map(member => ({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: '', 
      role: member.role,
      status: member.isActive ? 'active' : 'inactive',
      joinDate: member.createdAt.toISOString(),
      commissionRate: member.commissionRate,
      totalAppointments: member.barberAppointments.length,
      totalRevenue: member.barberAppointments
        .filter(apt => apt.status === 'completed' && apt.finalPrice)
        .reduce((total, apt) => total + (apt.finalPrice || 0), 0)
    }));

    res.json({
      success: true,
      data: transformedStaff
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff members',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get staff member by ID
export const getStaffById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const staff = await prisma.user.findFirst({
      where: {
        id: parseInt(id),
        role: {
          in: ['Boss', 'Staff']
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        commissionRate: true,
        createdAt: true,
        avatar: true,
        barberAppointments: {
          select: {
            id: true,
            status: true,
            finalPrice: true
          }
        }
      }
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Transform data to match frontend expectations
    const transformedStaff = {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      phone: '', // Phone number not stored in User model
      role: staff.role,
      status: staff.isActive ? 'active' : 'inactive',
      joinDate: staff.createdAt.toISOString(),
      commissionRate: staff.commissionRate || 40.0,
      totalAppointments: staff.barberAppointments.length,
      totalRevenue: staff.barberAppointments
        .filter(apt => apt.status === 'completed' && apt.finalPrice)
        .reduce((total, apt) => total + (apt.finalPrice || 0), 0)
    };

    res.json({
      success: true,
      data: transformedStaff
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Create new staff member
export const createStaff = async (req: Request, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can create staff members'
      });
    }

    const { name, email, role } = req.body;

    // Validate required fields
    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and role are required'
      });
    }

    // Validate role
    if (!['Boss', 'Staff'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either Boss or Staff'
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Generate a temporary password (staff should change it on first login)
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create staff member (inactive by default until Boss activates)
    const newStaff = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role as 'Boss' | 'Staff',
        isActive: false
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        avatar: true
      }
    });

    // Transform data to match frontend expectations
    const transformedStaff = {
      id: newStaff.id,
      name: newStaff.name,
      email: newStaff.email,
      phone: '', // Phone number not stored in User model
      role: newStaff.role,
      status: newStaff.isActive ? 'active' : 'inactive',
      joinDate: newStaff.createdAt.toISOString(),
      totalAppointments: 0,
      totalRevenue: 0,
      tempPassword // Include temp password in response for initial setup
    };

    res.status(201).json({
      success: true,
      data: transformedStaff,
      message: `Staff member created successfully. Temporary password: ${tempPassword}`
    });
  } catch (error) {
    console.error('Error creating staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update staff member
export const updateStaff = async (req: Request, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can update staff members'
      });
    }

    const { id } = req.params;
    const { name, email, role, isActive } = req.body;

    // Check if staff member exists
    const existingStaff = await prisma.user.findFirst({
      where: {
        id: parseInt(id),
        role: {
          in: ['Boss', 'Staff']
        }
      }
    });

    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== existingStaff.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email }
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Update staff member
    const updatedStaff = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role: role as 'Boss' | 'Staff' }),
        ...(typeof isActive === 'boolean' && { isActive })
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        avatar: true,
        barberAppointments: {
          select: {
            id: true,
            status: true,
            finalPrice: true
          }
        }
      }
    });

    // Transform data to match frontend expectations
    const transformedStaff = {
      id: updatedStaff.id,
      name: updatedStaff.name,
      email: updatedStaff.email,
      phone: '', // Phone number not stored in User model
      role: updatedStaff.role,
      status: updatedStaff.isActive ? 'active' : 'inactive',
      joinDate: updatedStaff.createdAt.toISOString(),
      totalAppointments: updatedStaff.barberAppointments.length,
      totalRevenue: updatedStaff.barberAppointments
        .filter(apt => apt.status === 'completed' && apt.finalPrice)
        .reduce((total, apt) => total + (apt.finalPrice || 0), 0)
    };

    res.json({
      success: true,
      data: transformedStaff,
      message: 'Staff member updated successfully'
    });
  } catch (error) {
    console.error('Error updating staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete staff member
export const deleteStaff = async (req: Request, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can delete staff members'
      });
    }

    const { id } = req.params;

    // Check if staff member exists
    const existingStaff = await prisma.user.findFirst({
      where: {
        id: parseInt(id),
        role: {
          in: ['Boss', 'Staff']
        }
      }
    });

    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Check if staff member has appointments
    const appointmentCount = await prisma.appointment.count({
      where: { barberId: parseInt(id) }
    });

    if (appointmentCount > 0) {
      // Instead of deleting, deactivate the staff member
      await prisma.user.update({
        where: { id: parseInt(id) },
        data: { isActive: false }
      });

      return res.json({
        success: true,
        message: 'Staff member has appointments and has been deactivated instead of deleted'
      });
    }

    // Delete staff member if no appointments
    await prisma.user.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Toggle staff member active status
export const toggleStaffStatus = async (req: Request, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can toggle staff status'
      });
    }

    const { id } = req.params;

    // Check if staff member exists
    const existingStaff = await prisma.user.findFirst({
      where: {
        id: parseInt(id),
        role: {
          in: ['Boss', 'Staff']
        }
      }
    });

    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Toggle active status
    const updatedStaff = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isActive: !existingStaff.isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        avatar: true,
        barberAppointments: {
          select: {
            id: true,
            status: true,
            finalPrice: true
          }
        }
      }
    });

    // Transform data to match frontend expectations
    const transformedStaff = {
      id: updatedStaff.id,
      name: updatedStaff.name,
      email: updatedStaff.email,
      phone: '', // Phone number not stored in User model
      role: updatedStaff.role,
      status: updatedStaff.isActive ? 'active' : 'inactive',
      joinDate: updatedStaff.createdAt.toISOString(),
      totalAppointments: updatedStaff.barberAppointments.length,
      totalRevenue: updatedStaff.barberAppointments
        .filter(apt => apt.status === 'completed' && apt.finalPrice)
        .reduce((total, apt) => total + (apt.finalPrice || 0), 0)
    };

    res.json({
      success: true,
      data: transformedStaff,
      message: `Staff member ${updatedStaff.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling staff status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle staff status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
