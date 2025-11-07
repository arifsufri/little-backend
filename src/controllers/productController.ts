import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

    // Get all products
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const { activeOnly } = req.query;
    
    const where: any = {};
    if (activeOnly === 'true') {
      where.isActive = true;
    }

    const products = await (prisma as any).product.findMany({
      where,
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
      data: products,
      message: 'Products retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
      message: 'Internal server error'
    });
  }
};

// Get product by ID
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID',
        message: 'Product ID must be a number'
      });
    }

    const product = await (prisma as any).product.findUnique({
      where: { id: productId },
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

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        message: 'No product found with the specified ID'
      });
    }

    res.json({
      success: true,
      data: product,
      message: 'Product retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
      message: 'Internal server error'
    });
  }
};

// Create product (Boss only)
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, price, stock } = req.body;
    
    // Check if user is Boss
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || user.role !== 'Boss') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss role can create products'
      });
    }

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Name and price are required'
      });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const product = await (prisma as any).product.create({
      data: {
        name,
        description: description || null,
        price: parseFloat(price),
        stock: stock ? parseInt(stock) : 0,
        imageUrl: imageUrl,
        createdBy: req.user!.userId,
        isActive: true
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
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create product',
      message: 'Internal server error'
    });
  }
};

// Update product (Boss only)
export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id);
    const { name, description, price, stock, isActive } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID',
        message: 'Product ID must be a number'
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
        message: 'Only Boss role can update products'
      });
    }

    // Check if product exists
    const existingProduct = await (prisma as any).product.findUnique({
      where: { id: productId }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        message: 'No product found with the specified ID'
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description || null;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (stock !== undefined) updateData.stock = parseInt(stock);
    if (isActive !== undefined) updateData.isActive = isActive;

    // Handle image upload
    if (req.file) {
      updateData.imageUrl = `/uploads/${req.file.filename}`;
    }

    const product = await (prisma as any).product.update({
      where: { id: productId },
      data: updateData,
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
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product',
      message: 'Internal server error'
    });
  }
};

// Delete product (Boss only)
export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID',
        message: 'Product ID must be a number'
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
        message: 'Only Boss role can delete products'
      });
    }

    // Check if product exists
    const existingProduct = await (prisma as any).product.findUnique({
      where: { id: productId }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        message: 'No product found with the specified ID'
      });
    }

    await (prisma as any).product.delete({
      where: { id: productId }
    });

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product',
      message: 'Internal server error'
    });
  }
};

// Sell product (Staff can sell, Boss can also sell)
export const sellProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, clientId, quantity, notes, commissionRate, staffId } = req.body;

    // Check if user is Boss or Staff
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || !['Boss', 'Staff'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss and Staff can sell products'
      });
    }

    let targetStaffId = req.user!.userId;
    
    if (staffId) {
      const parsedStaffId = parseInt(staffId);
      const targetStaff = await prisma.user.findUnique({
        where: { id: parsedStaffId }
      });
      
      if (targetStaff && ['Boss', 'Staff'].includes(targetStaff.role)) {
        targetStaffId = parsedStaffId;
      }
    }

    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Product ID and quantity are required'
      });
    }

    // Get product
    const product = await (prisma as any).product.findUnique({
      where: { id: parseInt(productId) }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        message: 'No product found with the specified ID'
      });
    }

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Product not available',
        message: 'This product is not active'
      });
    }

    // Check stock if tracking stock
    // Allow selling when stock is 0 (stock might not be accurately tracked)
    // Only block if stock is explicitly set and is less than requested quantity
    const requestedQty = parseInt(quantity);
    if (product.stock !== null && product.stock > 0 && product.stock < requestedQty) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock',
        message: `Only ${product.stock} units available in stock`
      });
    }

    // Verify client if provided
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: parseInt(clientId) }
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'Client not found',
          message: 'No client found with the specified ID'
        });
      }
    }

    const qty = parseInt(quantity);
    const unitPrice = product.price;
    const totalPrice = qty * unitPrice;
    
    // Get the staff member's product commission rate
    const staffMember = await prisma.user.findUnique({
      where: { id: targetStaffId },
      select: { name: true }
    });
    
    // Get productCommissionRate using type assertion (field exists in DB but Prisma client not regenerated)
    const staffMemberFull = await (prisma.user.findUnique({
      where: { id: targetStaffId }
    }) as any);
    
    // Use provided commissionRate, or staff's productCommissionRate, or default 5%
    const commission = commissionRate 
      ? parseFloat(commissionRate) 
      : (staffMemberFull?.productCommissionRate ?? 5.0);
    
    const commissionAmount = (totalPrice * commission) / 100;

    // Create sale record
    const sale = await (prisma as any).productSale.create({
      data: {
        productId: product.id,
        clientId: clientId ? parseInt(clientId) : null,
        staffId: targetStaffId, // Use the determined staff ID (appointment barber or logged-in user)
        quantity: qty,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        commissionRate: commission,
        commissionAmount: commissionAmount,
        notes: notes || null
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true
          }
        },
        staff: {
          select: {
            id: true,
            name: true,
            role: true,
            email: true
          }
        },
        client: {
          select: {
            id: true,
            clientId: true,
            fullName: true
          }
        }
      }
    });

    // Update product stock if tracking (only if stock > 0, allow going negative)
    if (product.stock !== null) {
      const newStock = product.stock - qty;
      await (prisma as any).product.update({
        where: { id: product.id },
        data: {
          stock: newStock
        }
      });
    }

    res.status(201).json({
      success: true,
      data: sale,
      message: 'Product sold successfully'
    });
  } catch (error) {
    console.error('Error selling product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sell product',
      message: 'Internal server error'
    });
  }
};

// Get all product sales
export const getAllProductSales = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, staffId, productId } = req.query;

    // Check if user is Boss or Staff
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || !['Boss', 'Staff'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss and Staff can view product sales'
      });
    }

    const where: any = {};

    // Staff can only see their own sales
    if (user.role === 'Staff') {
      where.staffId = req.user!.userId;
    } else if (staffId) {
      where.staffId = parseInt(staffId as string);
    }

    if (productId) {
      where.productId = parseInt(productId as string);
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    const sales = await prisma.productSale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
            clientId: true,
            fullName: true
          }
        },
        staff: {
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
      data: sales,
      message: 'Product sales retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching product sales:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product sales',
      message: 'Internal server error'
    });
  }
};

// Delete product sale
export const deleteProductSale = async (req: AuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.id);

    if (isNaN(saleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sale ID',
        message: 'Sale ID must be a valid number'
      });
    }

    // Check if user is Boss or Staff
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId }
    });

    if (!user || !['Boss', 'Staff'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only Boss and Staff can delete product sales'
      });
    }

    // Check if sale exists
    const sale = await (prisma as any).productSale.findUnique({
      where: { id: saleId },
      include: {
        product: {
          select: {
            id: true,
            stock: true
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found',
        message: 'No product sale found with the specified ID'
      });
    }

    // Staff can only delete their own sales (unless Boss)
    if (user.role === 'Staff' && sale.staffId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'You can only delete your own sales'
      });
    }

    // Restore product stock if tracking
    if (sale.product && sale.product.stock !== null) {
      await (prisma as any).product.update({
        where: { id: sale.productId },
        data: {
          stock: {
            increment: sale.quantity
          }
        }
      });
    }

    // Find related appointments and update their finalPrice
    // Match by clientId and date (created within same day)
    if (sale.clientId) {
      const saleDate = sale.createdAt;
      const startOfDay = new Date(saleDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(saleDate);
      endOfDay.setHours(23, 59, 59, 999);

      const relatedAppointments = await prisma.appointment.findMany({
        where: {
          clientId: sale.clientId,
          OR: [
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
          ]
        }
      });

      // Update each related appointment's finalPrice
      for (const appointment of relatedAppointments) {
        // Get all product sales for this appointment (same client, same day)
        const allProductSales = await (prisma as any).productSale.findMany({
          where: {
            clientId: sale.clientId,
            createdAt: {
              gte: startOfDay,
              lte: endOfDay
            },
            id: {
              not: saleId // Exclude the sale being deleted
            }
          }
        });

        // Calculate total product price
        const totalProductPrice = allProductSales.reduce((sum: number, ps: any) => sum + ps.totalPrice, 0);

        // Recalculate finalPrice: originalPrice (services) + product prices - discount
        const servicePrice = appointment.originalPrice || 0;
        const discountAmount = appointment.discountAmount || 0;
        const newFinalPrice = Math.max(0, servicePrice + totalProductPrice - discountAmount);

        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            finalPrice: newFinalPrice
          }
        });
      }
    }

    // Delete the sale
    await (prisma as any).productSale.delete({
      where: { id: saleId }
    });

    res.json({
      success: true,
      message: 'Product sale deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product sale:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product sale',
      message: 'Internal server error'
    });
  }
};

