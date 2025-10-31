import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

// Get financial overview for Boss
export const getFinancialOverview = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can access financial overview'
      });
    }

    const { startDate, endDate } = req.query;
    
    // Build date filter - use createdAt instead of appointmentDate for walk-in appointments
    const dateFilter: any = {};
    if (startDate && endDate) {
      // Convert to Malaysian timezone (GMT+8)
      const startOfDay = new Date(startDate as string + 'T00:00:00+08:00');
      const endOfDay = new Date(endDate as string + 'T23:59:59.999+08:00');
      
      dateFilter.OR = [
        {
          appointmentDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        {
          appointmentDate: null,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      ];
    }

    // Get all completed appointments
    const completedAppointments = await prisma.appointment.findMany({
      where: {
        status: 'completed',
        finalPrice: { not: null },
        ...dateFilter
      },
      include: {
        barber: true,
        package: true,
        client: true
      }
    });

    // Calculate total revenue
    const totalRevenue = completedAppointments.reduce(
      (sum, apt) => sum + (apt.finalPrice || 0), 0
    );

    // Calculate total commission paid
    const totalCommissionPaid = completedAppointments.reduce((sum, apt) => {
      if (apt.barber && apt.barber.commissionRate) {
        return sum + ((apt.finalPrice || 0) * (apt.barber.commissionRate / 100));
      }
      return sum;
    }, 0);

    // Get total expenses
    const expenseFilter: any = {};
    if (startDate && endDate) {
      // Convert to Malaysian timezone (GMT+8)
      const startOfDay = new Date(startDate as string + 'T00:00:00+08:00');
      const endOfDay = new Date(endDate as string + 'T23:59:59.999+08:00');
      
      expenseFilter.date = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    const expenses = await prisma.expense.findMany({
      where: expenseFilter
    });

    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Calculate net profit
    const netProfit = totalRevenue - totalCommissionPaid - totalExpenses;

    // Get total customers served
    const totalCustomers = new Set(completedAppointments.map(apt => apt.clientId)).size;

    // Get barber performance
    const barberPerformance = await getBarberPerformance(dateFilter);

    // Get service breakdown
    const serviceBreakdown = await getServiceBreakdown(dateFilter);

    res.json({
      success: true,
      data: {
        overview: {
          totalRevenue,
          totalCommissionPaid,
          totalExpenses,
          netProfit,
          totalCustomers
        },
        barberPerformance,
        serviceBreakdown,
        expenses: expenses.map(exp => ({
          id: exp.id,
          category: exp.category,
          description: exp.description,
          amount: exp.amount,
          date: exp.date
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching financial overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch financial overview',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get barber performance data
async function getBarberPerformance(dateFilter: any) {
  const barbers = await prisma.user.findMany({
    where: {
      role: { in: ['Boss', 'Staff'] },
      isActive: true
    },
    include: {
      barberAppointments: {
        where: {
          status: 'completed',
          finalPrice: { not: null },
          ...(Object.keys(dateFilter).length > 0 ? dateFilter : {})
        },
        include: {
          client: true,
          package: true
        }
      }
    }
  });

  return barbers.map(barber => {
    const appointments = barber.barberAppointments;
    const totalSales = appointments.reduce((sum, apt) => sum + (apt.finalPrice || 0), 0);
    const commissionPaid = totalSales * ((barber.commissionRate || 0) / 100);
    const customerCount = new Set(appointments.map(apt => apt.clientId)).size;

    return {
      id: barber.id,
      name: barber.name,
      customerCount,
      totalSales,
      commissionPaid,
      commissionRate: barber.commissionRate || 0,
      appointmentCount: appointments.length
    };
  });
}

// Get service breakdown data
async function getServiceBreakdown(dateFilter: any) {
  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'completed',
      finalPrice: { not: null },
      ...(Object.keys(dateFilter).length > 0 ? dateFilter : {})
    },
    include: {
      package: true
    }
  });

  const serviceMap = new Map();

  appointments.forEach(apt => {
    const serviceName = apt.package.name;
    if (!serviceMap.has(serviceName)) {
      serviceMap.set(serviceName, {
        name: serviceName,
        count: 0,
        totalRevenue: 0
      });
    }
    
    const service = serviceMap.get(serviceName);
    service.count += 1;
    service.totalRevenue += apt.finalPrice || 0;
  });

  return Array.from(serviceMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// Get staff personal financial report
export const getStaffFinancialReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || !['Boss', 'Staff'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only Boss or Staff can access this report'
      });
    }

    const { startDate, endDate } = req.query;
    
    // Build date filter - use createdAt instead of appointmentDate for walk-in appointments
    const dateFilter: any = {};
    if (startDate && endDate) {
      // Convert to Malaysian timezone (GMT+8)
      const startOfDay = new Date(startDate as string + 'T00:00:00+08:00');
      const endOfDay = new Date(endDate as string + 'T23:59:59.999+08:00');
      
      dateFilter.OR = [
        {
          appointmentDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        {
          appointmentDate: null,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      ];
    }

    // Get staff appointments
    const appointments = await prisma.appointment.findMany({
      where: {
        barberId: user.id,
        status: 'completed',
        finalPrice: { not: null },
        ...dateFilter
      },
      include: {
        package: true,
        client: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Debug logging
    console.log(`Staff Financial Report Debug:
      - User ID: ${user.id}
      - User Email: ${user.email}
      - Query params: ${JSON.stringify({ startDate, endDate })}
      - Date Filter: ${JSON.stringify(dateFilter)}
      - Found ${appointments.length} appointments
      - Appointments: ${JSON.stringify(appointments.map(a => ({ 
        id: a.id, 
        barberId: a.barberId, 
        status: a.status, 
        finalPrice: a.finalPrice,
        appointmentDate: a.appointmentDate,
        createdAt: a.createdAt
      })))}
    `);

    // Calculate earnings
    const totalCustomers = appointments.length;
    const totalRevenue = appointments.reduce((sum, apt) => sum + (apt.finalPrice || 0), 0);
    const commissionRate = user.commissionRate || 0;
    const totalEarnings = totalRevenue * (commissionRate / 100);

    // Service breakdown
    const serviceMap = new Map();
    appointments.forEach(apt => {
      const serviceName = apt.package.name;
      const servicePrice = apt.finalPrice || 0;
      const barberShare = servicePrice * (commissionRate / 100);

      if (!serviceMap.has(serviceName)) {
        serviceMap.set(serviceName, {
          name: serviceName,
          count: 0,
          totalRevenue: 0,
          barberShare: 0
        });
      }
      
      const service = serviceMap.get(serviceName);
      service.count += 1;
      service.totalRevenue += servicePrice;
      service.barberShare += barberShare;
    });

    const serviceBreakdown = Array.from(serviceMap.values());

    // Daily earnings history
    const dailyEarnings = new Map();
    appointments.forEach(apt => {
      const date = apt.appointmentDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
      const earnings = (apt.finalPrice || 0) * (commissionRate / 100);

      if (!dailyEarnings.has(date)) {
        dailyEarnings.set(date, {
          date,
          customers: 0,
          totalEarnings: 0
        });
      }

      const dayData = dailyEarnings.get(date);
      dayData.customers += 1;
      dayData.totalEarnings += earnings;
    });

    const earningsHistory = Array.from(dailyEarnings.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json({
      success: true,
      data: {
        summary: {
          totalCustomers,
          totalEarnings,
          commissionRate,
          totalServices: appointments.length
        },
        serviceBreakdown,
        earningsHistory,
        recentAppointments: appointments.slice(0, 10).map(apt => ({
          id: apt.id,
          date: apt.appointmentDate,
          client: apt.client.fullName,
          service: apt.package.name,
          totalPrice: apt.finalPrice,
          earnings: (apt.finalPrice || 0) * (commissionRate / 100)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching staff financial report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff financial report',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update staff commission rate (Boss only)
export const updateCommissionRate = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can update commission rates'
      });
    }

    const { staffId } = req.params;
    const { commissionRate } = req.body;

    // Validate commission rate
    if (typeof commissionRate !== 'number' || commissionRate < 0 || commissionRate > 100) {
      return res.status(400).json({
        success: false,
        message: 'Commission rate must be a number between 0 and 100'
      });
    }

    // Update staff commission rate
    const updatedStaff = await prisma.user.update({
      where: {
        id: parseInt(staffId),
        role: { in: ['Boss', 'Staff'] }
      },
      data: {
        commissionRate
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        commissionRate: true
      }
    });

    res.json({
      success: true,
      data: updatedStaff,
      message: 'Commission rate updated successfully'
    });
  } catch (error) {
    console.error('Error updating commission rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update commission rate',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Add expense (Boss only)
export const addExpense = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can add expenses'
      });
    }

    const { category, description, amount, date } = req.body;

    // Validate required fields
    if (!category || !description || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Category, description, and amount are required'
      });
    }

    // Create expense
    const expense = await prisma.expense.create({
      data: {
        category,
        description,
        amount: parseFloat(amount),
        date: date ? new Date(date) : new Date(),
        createdBy: user.id
      }
    });

    res.json({
      success: true,
      data: expense,
      message: 'Expense added successfully'
    });
  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add expense',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get expenses (Boss only)
export const getExpenses = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can view expenses'
      });
    }

    const { startDate, endDate, category } = req.query;
    
    // Build filter
    const filter: any = {};
    if (startDate && endDate) {
      filter.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }
    if (category) {
      filter.category = category;
    }

    const expenses = await prisma.expense.findMany({
      where: filter,
      orderBy: {
        date: 'desc'
      },
      include: {
        creator: {
          select: {
            name: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: expenses
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete expense (Boss only)
export const deleteExpense = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        message: 'Only Boss can delete expenses'
      });
    }

    const { id } = req.params;

    await prisma.expense.delete({
      where: {
        id: parseInt(id)
      }
    });

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const resetMonthlySummary = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Start date and end date are required'
      });
    }

    // Check user authorization - only Boss can reset monthly summary
    if ((req as any).user) {
      const currentUser = await prisma.user.findUnique({
        where: { id: (req as any).user.userId },
        select: { id: true, role: true }
      });
      
      if (currentUser?.role !== 'Boss') {
        return res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: 'Only Boss can reset monthly summary'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Convert to Malaysian timezone (GMT+8)
    const startOfPeriod = new Date(startDate + 'T00:00:00+08:00');
    const endOfPeriod = new Date(endDate + 'T23:59:59.999+08:00');

    console.log(`Resetting monthly summary for period: ${startOfPeriod} to ${endOfPeriod}`);

    // Build date filter for appointments
    const appointmentDateFilter = {
      OR: [
        {
          appointmentDate: {
            gte: startOfPeriod,
            lte: endOfPeriod
          }
        },
        {
          appointmentDate: null,
          createdAt: {
            gte: startOfPeriod,
            lte: endOfPeriod
          }
        }
      ]
    };

    // Build date filter for expenses
    const expenseDateFilter = {
      date: {
        gte: startOfPeriod,
        lte: endOfPeriod
      }
    };

    // Start transaction to ensure data consistency
    await prisma.$transaction(async (tx) => {
      // 1. Reset all appointments in the date range to "pending" status
      const appointmentUpdateResult = await tx.appointment.updateMany({
        where: appointmentDateFilter,
        data: {
          status: 'pending',
          additionalPackages: undefined,
          customPackages: undefined,
          finalPrice: null
        }
      });

      // 2. Delete all expenses in the date range
      const expenseDeleteResult = await tx.expense.deleteMany({
        where: expenseDateFilter
      });

      console.log(`Reset complete:
        - Updated ${appointmentUpdateResult.count} appointments to pending status
        - Deleted ${expenseDeleteResult.count} expense records
      `);
    });

    res.json({
      success: true,
      message: 'Monthly summary has been reset successfully',
      data: {
        period: {
          startDate: startOfPeriod.toISOString(),
          endDate: endOfPeriod.toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error resetting monthly summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset monthly summary',
      message: 'Internal server error'
    });
  }
};
