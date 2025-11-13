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

    // Build product sales date filter
    const productSalesDateFilter: any = {};
    if (startDate && endDate) {
      const startOfDay = new Date(startDate as string + 'T00:00:00+08:00');
      const endOfDay = new Date(endDate as string + 'T23:59:59.999+08:00');
      productSalesDateFilter.createdAt = {
        gte: startOfDay,
        lte: endOfDay
      };
    }
    
    // Get product sales for the date range
    const productSales = await (prisma as any).productSale.findMany({
      where: productSalesDateFilter
    });
    
    const appointmentRevenue = completedAppointments.reduce(
      (sum, apt) => sum + (apt.finalPrice || 0), 0
    );
    const appointmentClientDayKeys = new Set<string>();
    for (const apt of completedAppointments) {
      const clientId = apt.clientId;
      if (!clientId) continue;
      const date = (apt.appointmentDate ?? apt.createdAt).toISOString().split('T')[0];
      appointmentClientDayKeys.add(`${clientId}-${date}`);
    }
    
    const filteredProductSalesRevenue = 0;
    
    const totalRevenue = appointmentRevenue + filteredProductSalesRevenue;
    
    let totalCommissionPaid = completedAppointments.reduce((sum, apt) => {
      if (apt.barber && apt.barber.commissionRate) {
        const priceForCommission = apt.originalPrice || apt.finalPrice || 0;
        return sum + (priceForCommission * (apt.barber.commissionRate / 100));
      }
      return sum;
    }, 0);

    // Add product sales commission (5% of product sales)
    const productSalesCommission = productSales.reduce((sum: number, sale: any) => sum + (sale.commissionAmount || 0), 0);
    totalCommissionPaid += productSalesCommission;

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

    // Get product sales breakdown
    const productSalesBreakdown = await getProductSalesBreakdown(productSalesDateFilter);

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
        productSalesBreakdown,
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

  // Build product sales date filter - match the appointment date filter
  // Extract date range from the dateFilter OR conditions (both use same date range)
  const productSalesDateFilter: any = {};
  
  if (Object.keys(dateFilter).length > 0) {
    if (dateFilter.OR && Array.isArray(dateFilter.OR) && dateFilter.OR.length > 0) {
      // Both OR conditions have the same date range, extract from the first one that has it
      const appointmentDateCondition = dateFilter.OR.find((c: any) => c.appointmentDate);
      const createdAtCondition = dateFilter.OR.find((c: any) => c.createdAt);
      
      // Use the date range from either condition (they're the same)
      if (appointmentDateCondition && appointmentDateCondition.appointmentDate) {
        productSalesDateFilter.createdAt = appointmentDateCondition.appointmentDate;
      } else if (createdAtCondition && createdAtCondition.createdAt) {
        productSalesDateFilter.createdAt = createdAtCondition.createdAt;
      }
    } else if (dateFilter.appointmentDate) {
      productSalesDateFilter.createdAt = dateFilter.appointmentDate;
    } else if (dateFilter.createdAt) {
      productSalesDateFilter.createdAt = dateFilter.createdAt;
    }
  }
  // If no date filter, fetch all product sales (empty filter = all records)

  // Get all product sales for the date range
  const allProductSales = await (prisma as any).productSale.findMany({
    where: productSalesDateFilter,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true
        }
      }
    }
  });

  const productTotalsByStaffClientDate = new Map<string, number>();
  const productCommissionByStaff = new Map<number, number>();
  for (const sale of allProductSales) {
    const date = new Date(sale.createdAt).toISOString().split('T')[0];
    const key = `${sale.staffId}-${sale.clientId ?? 'walkin'}-${date}`;
    productTotalsByStaffClientDate.set(key, (productTotalsByStaffClientDate.get(key) || 0) + (sale.totalPrice || 0));
    productCommissionByStaff.set(sale.staffId, (productCommissionByStaff.get(sale.staffId) || 0) + (sale.commissionAmount || 0));
  }

  const performance = barbers.map(barber => {
    const appointments = barber.barberAppointments;
    const appointmentSalesRevenue = appointments.reduce((sum, apt) => sum + (apt.finalPrice || 0), 0);

    const appointmentRevenueByDay = new Map<string, number>();
    for (const apt of appointments) {
      const date = (apt.appointmentDate ?? apt.createdAt).toISOString().split('T')[0];

      appointmentRevenueByDay.set(date, (appointmentRevenueByDay.get(date) || 0) + (apt.originalPrice || apt.finalPrice || 0));
    }
    const staffSales = allProductSales.filter((sale: any) => sale.staffId === barber.id);
    const productRevenueByDay = new Map<string, number>();
    for (const sale of staffSales) {
      const date = new Date(sale.createdAt).toISOString().split('T')[0];
      productRevenueByDay.set(date, (productRevenueByDay.get(date) || 0) + (sale.totalPrice || 0));
    }
    // Calculate service commission based on originalPrice (before discount, services only)
    const serviceOnlyRevenueTotal = appointments.reduce((sum, apt) => {
      return sum + (apt.originalPrice || apt.finalPrice || 0);
    }, 0);
    const serviceCommission = serviceOnlyRevenueTotal * ((barber.commissionRate || 0) / 100);

    const barberProductSales = allProductSales.filter((sale: any) => sale.staffId === barber.id);
    const productSalesCommission = productCommissionByStaff.get(barber.id) || 0;
    const commissionPaid = serviceCommission + productSalesCommission;

    const totalSales = appointmentSalesRevenue;
    const totalSalesRounded = Math.round(totalSales * 100) / 100;
    const commissionPaidRounded = Math.round(commissionPaid * 100) / 100;

    const customerCount = new Set(appointments.map(apt => apt.clientId)).size;

    // Count appointments by package type
    const packageCounts = new Map<string, number>();
    appointments.forEach(apt => {
      if (apt.package && apt.package.name) {
        const count = packageCounts.get(apt.package.name) || 0;
        packageCounts.set(apt.package.name, count + 1);
      }
    });

    // Count products sold by product type
    const productCounts = new Map<string, number>();
    barberProductSales.forEach((sale: any) => {
      if (sale.product && sale.product.name) {
        const count = productCounts.get(sale.product.name) || 0;
        productCounts.set(sale.product.name, count + 1);
      }
    });

    const result = {
      id: barber.id,
      name: barber.name,
      customerCount,
      totalSales: totalSalesRounded,
      commissionPaid: commissionPaidRounded,
      commissionRate: barber.commissionRate || 0,
      appointmentCount: appointments.length,
      packageBreakdown: Array.from(packageCounts.entries()).map(([name, count]) => ({ name, count })),
      productBreakdown: Array.from(productCounts.entries()).map(([name, count]) => ({ name, count })),
      totalProductsSold: barberProductSales.length
    };

    console.log(`[Financial] Barber Performance Debug → ${barber.name}`, {
      barberId: barber.id,
      appointmentCount: appointments.length,
      packageBreakdown: Array.from(packageCounts.entries()),
      productBreakdown: Array.from(productCounts.entries()),
      totalProductsSold: barberProductSales.length,
      serviceOnlyRevenueTotal: serviceOnlyRevenueTotal.toFixed(2),
      serviceCommission: serviceCommission.toFixed(2),
      productSalesCommission: productSalesCommission.toFixed(2),
      totalCommissionPaid: commissionPaidRounded.toFixed(2),
      commissionRate: barber.commissionRate || 0
    });

    return result;
  });

  console.log('[Financial] Barber Performance Summary', performance.map(b => ({
    id: b.id,
    name: b.name,
    totalSales: Number(b.totalSales.toFixed(2)),
    commissionPaid: Number(b.commissionPaid.toFixed(2))
  })));

  return performance;
}

// Get product sales breakdown data
async function getProductSalesBreakdown(dateFilter: any) {
  const productSales = await (prisma as any).productSale.findMany({
    where: Object.keys(dateFilter).length > 0 ? dateFilter : {},
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true
        }
      }
    }
  });

  const productMap = new Map();

  productSales.forEach((sale: any) => {
    const productName = sale.product?.name || 'Unknown Product';
    const productPrice = sale.product?.price || 0;
    
    if (!productMap.has(productName)) {
      productMap.set(productName, {
        name: productName,
        quantity: 0,
        totalRevenue: 0
      });
    }
    
    const product = productMap.get(productName);
    product.quantity += sale.quantity || 1;
    product.totalRevenue += sale.totalPrice || 0;
  });

  return Array.from(productMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
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

  // Get all packages to lookup additional package names
  const allPackages = await prisma.package.findMany({
    select: {
      id: true,
      name: true,
      price: true
    }
  });
  const packageMap = new Map(allPackages.map(pkg => [pkg.id, pkg]));

  const serviceMap = new Map();

  appointments.forEach(apt => {
    const baseServiceName = apt.package?.name || 'Unknown Service';
    const baseServicePrice = apt.package?.price || 0;
    if (!serviceMap.has(baseServiceName)) {
      serviceMap.set(baseServiceName, {
        name: baseServiceName,
        count: 0,
        totalRevenue: 0
      });
    }
    const baseService = serviceMap.get(baseServiceName);
    baseService.count += 1;
    baseService.totalRevenue += baseServicePrice;

    const additionalPackageIds = apt.additionalPackages && Array.isArray(apt.additionalPackages) 
      ? apt.additionalPackages.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
      : [];
    additionalPackageIds.forEach(packageId => {
      const additionalPkg = packageMap.get(packageId);
      if (additionalPkg) {
        const additionalServiceName = additionalPkg.name;
        if (!serviceMap.has(additionalServiceName)) {
          serviceMap.set(additionalServiceName, {
            name: additionalServiceName,
            count: 0,
            totalRevenue: 0
          });
        }
        const additionalService = serviceMap.get(additionalServiceName);
        additionalService.count += 1;
        additionalService.totalRevenue += (additionalPkg.price || 0);
      }
    });
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

    // Get all packages to lookup additional package names
    const allPackages = await prisma.package.findMany({
      select: {
        id: true,
        name: true,
        price: true
      }
    });
    const packageMap = new Map(allPackages.map(pkg => [pkg.id, pkg]));

    // Get product sales for this staff member
    const productSalesWhere: any = {
      staffId: user.id
    };
    if (startDate && endDate) {
      const startOfDay = new Date(startDate as string + 'T00:00:00+08:00');
      const endOfDay = new Date(endDate as string + 'T23:59:59.999+08:00');
      productSalesWhere.createdAt = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    const productSales = await (prisma as any).productSale.findMany({
      where: productSalesWhere,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true
          }
        },
        client: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    // Calculate earnings from appointments
    const totalCustomers = appointments.length;
    const totalRevenue = appointments.reduce((sum, apt) => sum + (apt.finalPrice || 0), 0);
    // Commission calculated on original price, not discounted price
    const totalCommissionBase = appointments.reduce((sum, apt) => sum + (apt.originalPrice || apt.finalPrice || 0), 0);
    const commissionRate = user.commissionRate || 0;
    const appointmentEarnings = totalCommissionBase * (commissionRate / 100);

    // Calculate earnings from product sales (5% commission)
    const productSalesRevenue = productSales.reduce((sum: number, sale: any) => sum + sale.totalPrice, 0);
    const productSalesEarnings = productSales.reduce((sum: number, sale: any) => sum + sale.commissionAmount, 0);

    // Total earnings (appointments + product sales)
    const totalEarnings = appointmentEarnings + productSalesEarnings;

    // Service breakdown - include base package and additional packages
    const serviceMap = new Map();
    let totalServicesCount = 0;
    
    appointments.forEach(apt => {
      // Process base package
      const baseServiceName = apt.package.name;
      const servicePrice = apt.finalPrice || 0;
      // Commission calculated on original price, not discounted price
      const priceForCommission = apt.originalPrice || apt.finalPrice || 0;
      
      // Get additional package IDs
      const additionalPackageIds = apt.additionalPackages && Array.isArray(apt.additionalPackages) 
        ? apt.additionalPackages.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];
      
      // Calculate total package price for proportional distribution
      let totalPackagePrice = apt.package?.price || 0;
      additionalPackageIds.forEach(packageId => {
        const additionalPkg = packageMap.get(packageId);
        if (additionalPkg) {
          totalPackagePrice += additionalPkg.price || 0;
        }
      });
      
      // Process base package
      if (!serviceMap.has(baseServiceName)) {
        serviceMap.set(baseServiceName, {
          name: baseServiceName,
          count: 0,
          totalRevenue: 0,
          barberShare: 0
        });
      }
      
      const baseService = serviceMap.get(baseServiceName);
      baseService.count += 1;
      totalServicesCount += 1;
      
      // Calculate proportional revenue and commission for base package
      if (totalPackagePrice > 0) {
        const baseServicePrice = servicePrice * ((apt.package.price || 0) / totalPackagePrice);
        const basePriceForCommission = priceForCommission * ((apt.package.price || 0) / totalPackagePrice);
        baseService.totalRevenue += baseServicePrice;
        baseService.barberShare += basePriceForCommission * (commissionRate / 100);
      } else {
        baseService.totalRevenue += servicePrice;
        baseService.barberShare += priceForCommission * (commissionRate / 100);
      }
      
      // Process each additional package
      additionalPackageIds.forEach(packageId => {
        const additionalPkg = packageMap.get(packageId);
        if (additionalPkg) {
          const additionalServiceName = additionalPkg.name;
          
          if (!serviceMap.has(additionalServiceName)) {
            serviceMap.set(additionalServiceName, {
              name: additionalServiceName,
              count: 0,
              totalRevenue: 0,
              barberShare: 0
            });
          }
          
          const additionalService = serviceMap.get(additionalServiceName);
          additionalService.count += 1;
          totalServicesCount += 1;
          
          // Calculate proportional revenue and commission for additional package
          if (totalPackagePrice > 0) {
            const additionalServicePrice = servicePrice * ((additionalPkg.price || 0) / totalPackagePrice);
            const additionalPriceForCommission = priceForCommission * ((additionalPkg.price || 0) / totalPackagePrice);
            additionalService.totalRevenue += additionalServicePrice;
            additionalService.barberShare += additionalPriceForCommission * (commissionRate / 100);
          } else {
            const additionalServicePrice = servicePrice / (additionalPackageIds.length + 1);
            const additionalPriceForCommission = priceForCommission / (additionalPackageIds.length + 1);
            additionalService.totalRevenue += additionalServicePrice;
            additionalService.barberShare += additionalPriceForCommission * (commissionRate / 100);
          }
        }
      });
    });

    const serviceBreakdown = Array.from(serviceMap.values());

    // Daily earnings history
    const dailyEarnings = new Map();
    appointments.forEach(apt => {
      const date = apt.appointmentDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
      // Commission calculated on original price, not discounted price
      const priceForCommission = apt.originalPrice || apt.finalPrice || 0;
      const earnings = priceForCommission * (commissionRate / 100);

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
          appointmentEarnings,
          productSalesEarnings,
          productSalesRevenue,
          commissionRate,
          totalServices: totalServicesCount,
          totalProductSales: productSales.length
        },
        serviceBreakdown,
        earningsHistory,
        recentAppointments: appointments.slice(0, 10).map(apt => ({
          id: apt.id,
          date: apt.appointmentDate,
          client: apt.client.fullName,
          service: apt.package.name,
          totalPrice: apt.finalPrice,
          // Commission calculated on original price, not discounted price
          earnings: (apt.originalPrice || apt.finalPrice || 0) * (commissionRate / 100)
        })),
        recentProductSales: productSales.slice(0, 10).map((sale: any) => ({
          id: sale.id,
          date: sale.createdAt,
          client: sale.client?.fullName || 'Walk-in',
          product: sale.product.name,
          quantity: sale.quantity,
          totalPrice: sale.totalPrice,
          earnings: sale.commissionAmount
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
    const { commissionRate, productCommissionRate } = req.body;

    // Validate commission rates
    if (commissionRate !== undefined && (typeof commissionRate !== 'number' || commissionRate < 0 || commissionRate > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Commission rate must be a number between 0 and 100'
      });
    }

    if (productCommissionRate !== undefined && (typeof productCommissionRate !== 'number' || productCommissionRate < 0 || productCommissionRate > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Product commission rate must be a number between 0 and 100'
      });
    }

    // Build update data
    const updateData: any = {};
    if (commissionRate !== undefined) {
      updateData.commissionRate = commissionRate;
    }
    if (productCommissionRate !== undefined) {
      updateData.productCommissionRate = productCommissionRate;
    }

    // Update staff commission rate(s)
    const updatedStaff = await prisma.user.update({
      where: {
        id: parseInt(staffId),
        role: { in: ['Boss', 'Staff'] }
      },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        commissionRate: true,
        productCommissionRate: true
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
