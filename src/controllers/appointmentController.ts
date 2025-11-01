import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to apply multiple discount codes
const applyMultipleDiscounts = async (
  appointmentId: number,
  discountCodes: Array<{
    code: string;
    appliedToPackages: number[];
  }>,
  clientId: number,
  packageId: number,
  additionalPackages: number[] = []
) => {
  const appliedDiscounts = [];
  let totalDiscountAmount = 0;

  for (const discountRequest of discountCodes) {
    // Find the discount code
    const discountCode = await prisma.discountCode.findUnique({
      where: { 
        code: discountRequest.code,
        isActive: true 
      }
    });

    if (!discountCode) {
      throw new Error(`Discount code "${discountRequest.code}" not found or inactive`);
    }

    // Check if client has already used this discount code
    const existingUsage = await prisma.discountCodeUsage.findUnique({
      where: {
        discountCodeId_clientId: {
          discountCodeId: discountCode.id,
          clientId: clientId
        }
      }
    });

    if (existingUsage) {
      throw new Error(`Client has already used discount code "${discountRequest.code}"`);
    }

    // Validate applicable packages
    if (discountCode.applicablePackages && discountCode.applicablePackages.length > 0) {
      const requestedPackages = discountRequest.appliedToPackages;
      const invalidPackages = requestedPackages.filter(
        pkgId => !discountCode.applicablePackages.includes(pkgId)
      );
      
      if (invalidPackages.length > 0) {
        throw new Error(`Discount code "${discountRequest.code}" does not apply to some selected packages`);
      }
    }

    // Calculate discount amount for this code
    let discountableAmount = 0;
    
    // Get package prices
    const allPackageIds = [packageId, ...additionalPackages];
    const packages = await prisma.package.findMany({
      where: { id: { in: allPackageIds } }
    });

    // Calculate discountable amount for this specific discount
    for (const pkgId of discountRequest.appliedToPackages) {
      const pkg = packages.find(p => p.id === pkgId);
      if (pkg) {
        discountableAmount += pkg.price;
      }
    }

    const discountAmount = Math.round((discountableAmount * discountCode.discountPercent / 100) * 100) / 100;
    totalDiscountAmount += discountAmount;

    appliedDiscounts.push({
      discountCodeId: discountCode.id,
      appliedToPackages: discountRequest.appliedToPackages,
      discountAmount: discountAmount,
      code: discountRequest.code
    });
  }

  return { appliedDiscounts, totalDiscountAmount };
};

export const createAppointment = async (req: Request, res: Response) => {
  try {
    const { clientId, packageId, barberId, additionalPackages, appointmentDate, notes, discountCode } = req.body;

    if (!clientId || !packageId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Client ID and Package ID are required'
      });
    }

    // Verify client exists
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

    // Verify package exists
    const packageData = await prisma.package.findUnique({
      where: { id: parseInt(packageId) }
    });

    if (!packageData) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
        message: 'No package found with the specified ID'
      });
    }

    // Verify barber exists if provided
    let barber = null;
    if (barberId) {
      barber = await prisma.user.findUnique({
        where: { 
          id: parseInt(barberId),
          role: { in: ['Boss', 'Staff'] },
          isActive: true
        }
      });

      if (!barber) {
        return res.status(404).json({
          success: false,
          error: 'Barber not found',
          message: 'No active barber found with the specified ID'
        });
      }
    }

    // Verify additional packages if provided
    let additionalPackagesData = [];
    let originalPrice = packageData.price;

    if (additionalPackages && Array.isArray(additionalPackages) && additionalPackages.length > 0) {
      additionalPackagesData = await prisma.package.findMany({
        where: { id: { in: additionalPackages.map((id: any) => parseInt(id)) } }
      });

      if (additionalPackagesData.length !== additionalPackages.length) {
        return res.status(404).json({
          success: false,
          error: 'Some additional packages not found',
          message: 'One or more additional packages could not be found'
        });
      }

      // Calculate original total price
      originalPrice += additionalPackagesData.reduce((sum, pkg) => sum + pkg.price, 0);
    }

    // Handle discount code if provided
    let discountCodeData: any = null;
    let discountAmount = 0;
    let finalPrice = originalPrice;

    if (discountCode) {
      discountCodeData = await prisma.discountCode.findUnique({
        where: { 
          code: discountCode,
          isActive: true 
        }
      });

      if (discountCodeData) {
        // Check if client has already used this discount code
        const existingUsage = await prisma.discountCodeUsage.findUnique({
          where: {
            discountCodeId_clientId: {
              discountCodeId: discountCodeData.id,
              clientId: parseInt(clientId)
            }
          }
        });

        if (existingUsage) {
          return res.status(400).json({
            success: false,
            error: 'Discount code already used',
            message: 'This client has already used this discount code'
          });
        }

        // Check if discount applies to selected packages
        if (discountCodeData.applicablePackages && discountCodeData.applicablePackages.length > 0) {
          // Check if base package is applicable
          const basePackageApplicable = discountCodeData.applicablePackages.includes(parseInt(packageId));
          
          // Check additional packages
          const applicableAdditionalPackages = additionalPackages ? 
            additionalPackages.filter((id: any) => discountCodeData.applicablePackages.includes(id)) : [];
          
          if (!basePackageApplicable && applicableAdditionalPackages.length === 0) {
            return res.status(400).json({
              success: false,
              error: 'Discount not applicable',
              message: 'This discount code does not apply to any of the selected packages'
            });
          }
          
          // Calculate discount only on applicable packages
          let discountableAmount = 0;
          
          if (basePackageApplicable) {
            discountableAmount += packageData.price;
          }
          
          // Add applicable additional packages
          if (applicableAdditionalPackages.length > 0) {
            const applicablePackageDetails = await prisma.package.findMany({
              where: { id: { in: applicableAdditionalPackages } }
            });
            discountableAmount += applicablePackageDetails.reduce((sum, pkg) => sum + pkg.price, 0);
          }
          
          discountAmount = Math.round((discountableAmount * discountCodeData.discountPercent / 100) * 100) / 100;
        } else {
          // Apply to all packages (backward compatibility)
          discountAmount = Math.round((originalPrice * discountCodeData.discountPercent / 100) * 100) / 100;
        }
        
        finalPrice = originalPrice - discountAmount;
      } else {
        return res.status(404).json({
          success: false,
          error: 'Invalid discount code',
          message: 'Discount code not found or inactive'
        });
      }
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        clientId: parseInt(clientId),
        packageId: parseInt(packageId),
        barberId: barberId ? parseInt(barberId) : null,
        appointmentDate: appointmentDate ? new Date(appointmentDate) : null,
        notes: notes || null,
        additionalPackages: additionalPackages || null,
        originalPrice: originalPrice,
        finalPrice: finalPrice,
        discountCodeId: discountCodeData?.id || null,
        discountAmount: discountAmount || null,
        status: 'pending'
      },
      include: {
        client: {
          select: {
            clientId: true,
            fullName: true,
            phoneNumber: true
          }
        },
        package: {
          select: {
            name: true,
            description: true,
            price: true,
            duration: true,
            barber: true
          }
        },
        barber: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    // Create discount code usage record if discount was applied
    if (discountCodeData) {
      await prisma.discountCodeUsage.create({
        data: {
          discountCodeId: discountCodeData.id,
          clientId: parseInt(clientId),
          appointmentId: appointment.id
        }
      });
    }

    res.status(201).json({
      success: true,
      data: appointment,
      message: 'Appointment created successfully'
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create appointment',
      message: 'Internal server error'
    });
  }
};

export const getAllAppointments = async (req: Request, res: Response) => {
  try {
    const appointments = await prisma.appointment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        client: {
          select: {
            clientId: true,
            fullName: true,
            phoneNumber: true
          }
        },
        package: {
          select: {
            name: true,
            description: true,
            price: true,
            duration: true,
            barber: true,
            imageUrl: true
          }
        },
        barber: {
          select: {
            id: true,
            name: true,
            role: true,
            commissionRate: true
          }
        },
        appliedDiscounts: {
          include: {
            discountCode: {
              select: {
                id: true,
                code: true,
                discountPercent: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: appointments,
      message: 'Appointments retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch appointments',
      message: 'Internal server error'
    });
  }
};

export const getAppointmentById = async (req: Request, res: Response) => {
  try {
    const appointmentId = parseInt(req.params.id);

    if (isNaN(appointmentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid appointment ID',
        message: 'Appointment ID must be a valid number'
      });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        client: {
          select: {
            clientId: true,
            fullName: true,
            phoneNumber: true
          }
        },
        package: {
          select: {
            name: true,
            description: true,
            price: true,
            duration: true,
            barber: true,
            imageUrl: true
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
        message: 'No appointment found with the specified ID'
      });
    }

    res.json({
      success: true,
      data: appointment,
      message: 'Appointment retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch appointment',
      message: 'Internal server error'
    });
  }
};

export const updateAppointmentStatus = async (req: Request, res: Response) => {
  try {
    const appointmentId = parseInt(req.params.id);
    const { status, appointmentDate, notes, additionalPackages, customPackages, finalPrice, barberId, discountCodeId, discountAmount, multipleDiscountCodes } = req.body;

    if (isNaN(appointmentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid appointment ID',
        message: 'Appointment ID must be a valid number'
      });
    }

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        message: 'Status must be one of: pending, confirmed, completed, cancelled'
      });
    }

    // Check if appointment exists
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
        message: 'No appointment found with the specified ID'
      });
    }

    // If completing appointment, validate additional packages exist
    if (status === 'completed' && additionalPackages && additionalPackages.length > 0) {
      const packageIds = additionalPackages.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
      if (packageIds.length > 0) {
        const packages = await prisma.package.findMany({
          where: { id: { in: packageIds } }
        });
        if (packages.length !== packageIds.length) {
          return res.status(400).json({
            success: false,
            error: 'Invalid additional packages',
            message: 'One or more additional packages do not exist'
          });
        }
      }
    }

    // If marking as completed, assign current user as barber (if not already assigned)
    const updateData: any = {
      ...(status && { status }),
      ...(appointmentDate && { appointmentDate: new Date(appointmentDate) }),
      ...(notes !== undefined && { notes }),
      ...(additionalPackages !== undefined && { additionalPackages }),
      ...(customPackages !== undefined && { customPackages }),
      ...(finalPrice !== undefined && { finalPrice: parseFloat(finalPrice) }),
      ...(discountCodeId !== undefined && { discountCodeId: discountCodeId ? parseInt(discountCodeId) : null }),
      ...(discountAmount !== undefined && { discountAmount: discountAmount ? parseFloat(discountAmount) : null })
    };

    // Handle barber assignment (Boss only, unless auto-assigning on completion)
    if (barberId !== undefined) {
      // Verify user has permission to change barber (Boss only)
      if ((req as any).user) {
        const currentUser = await prisma.user.findUnique({
          where: { id: (req as any).user.userId },
          select: { id: true, role: true }
        });
        
        if (currentUser?.role === 'Boss' || currentUser?.role === 'Staff') {
          if (barberId === null) {
            updateData.barberId = null;
          } else {
            // Verify barber exists and is active
            const barber = await prisma.user.findUnique({
              where: { 
                id: parseInt(barberId),
                role: { in: ['Boss', 'Staff'] },
                isActive: true
              }
            });
            
            if (!barber) {
              return res.status(400).json({
                success: false,
                error: 'Invalid barber',
                message: 'Selected barber does not exist or is not active'
              });
            }
            
            updateData.barberId = parseInt(barberId);
          }
        } else {
          return res.status(403).json({
            success: false,
            error: 'Permission denied',
            message: 'Only Boss and Staff can change barber assignments'
          });
        }
      }
    }

    // Auto-assign barber when completing appointment
    if (status === 'completed' && (req as any).user) {
      const currentUser = await prisma.user.findUnique({
        where: { id: (req as any).user.userId },
        select: { id: true, role: true, email: true }
      });

      console.log(`Appointment Completion Debug:
        - Current User: ${JSON.stringify(currentUser)}
        - Existing Appointment barberId: ${existingAppointment.barberId}
        - Will assign barber: ${currentUser && ['Boss', 'Staff'].includes(currentUser.role) && !existingAppointment.barberId}
      `);

      // Only assign if user is Boss or Staff and appointment doesn't already have a barber
      if (currentUser && ['Boss', 'Staff'].includes(currentUser.role) && !existingAppointment.barberId) {
        updateData.barberId = currentUser.id;
        console.log(`Assigned barberId ${currentUser.id} to appointment ${appointmentId}`);
      }
    }

    // Update appointment (with discount code usage tra cking)
    const updatedAppointment = await prisma.$transaction(async (tx) => {
      // Update the appointment
      const appointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: updateData,
        include: {
          client: {
            select: {
              id: true,
              clientId: true,
              fullName: true,
              phoneNumber: true
            }
          },
          package: {
            select: {
              name: true,
              description: true,
              price: true,
              duration: true,
              barber: true
            }
          },
          barber: {
            select: {
              id: true,
              name: true,
              role: true,
              commissionRate: true
            }
          }
        }
      });

      // Handle multiple discount codes if provided
      if (status === 'completed' && multipleDiscountCodes && Array.isArray(multipleDiscountCodes) && multipleDiscountCodes.length > 0) {
        try {
          const packageIds = [appointment.packageId];
          if (additionalPackages && Array.isArray(additionalPackages)) {
            packageIds.push(...additionalPackages.map((id: any) => parseInt(id)));
          }

          const { appliedDiscounts } = await applyMultipleDiscounts(
            appointment.id,
            multipleDiscountCodes,
            appointment.client.id,
            appointment.packageId,
            additionalPackages ? additionalPackages.map((id: any) => parseInt(id)) : []
          );

          // Create AppointmentDiscount records
          for (const discount of appliedDiscounts) {
            await tx.appointmentDiscount.create({
              data: {
                appointmentId: appointment.id,
                discountCodeId: discount.discountCodeId,
                appliedToPackages: discount.appliedToPackages,
                discountAmount: discount.discountAmount
              }
            });

            // Create DiscountCodeUsage record
            await tx.discountCodeUsage.create({
              data: {
                discountCodeId: discount.discountCodeId,
                clientId: appointment.client.id,
                appointmentId: appointment.id
              }
            });
          }
        } catch (error: any) {
          console.error('Error applying multiple discount codes:', error);
          throw new Error(`Failed to apply discount codes: ${error.message}`);
        }
      }
      // Legacy single discount code support
      else if (status === 'completed' && discountCodeId && appointment.client.id) {
        try {
          await tx.discountCodeUsage.create({
            data: {
              discountCodeId: parseInt(discountCodeId),
              clientId: appointment.client.id,
              appointmentId: appointment.id
            }
          });
        } catch (error) {
          // If usage record already exists (shouldn't happen with proper validation), continue
          console.warn('Discount code usage record may already exist:', error);
        }
      }

      return appointment;
    });

    res.json({
      success: true,
      data: updatedAppointment,
      message: 'Appointment updated successfully'
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update appointment',
      message: 'Internal server error'
    });
  }
};

export const editAppointment = async (req: Request, res: Response) => {
  try {
    const appointmentId = parseInt(req.params.id);
    const { 
      clientId, 
      packageId, 
      barberId, 
      additionalPackages, 
      appointmentDate, 
      notes, 
      discountCode,
      discountAppliedTo,
      removeDiscount,
      multipleDiscountCodes 
    } = req.body;

    if (isNaN(appointmentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid appointment ID',
        message: 'Appointment ID must be a valid number'
      });
    }

    // Check user authorization - Boss and Staff can edit appointments
    if ((req as any).user) {
      const currentUser = await prisma.user.findUnique({
        where: { id: (req as any).user.userId },
        select: { id: true, role: true }
      });

      if (!currentUser || !['Boss', 'Staff'].includes(currentUser.role)) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'Only Boss and Staff can edit appointments'
        });
      }
    }

    // Get existing appointment
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        client: true,
        package: true,
        barber: true
      }
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
        message: 'No appointment found with the specified ID'
      });
    }

    // Verify client exists if being updated
    if (clientId && clientId !== existingAppointment.clientId) {
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

    // Verify package exists if being updated
    let packageData = existingAppointment.package;
    if (packageId && packageId !== existingAppointment.packageId) {
      const newPackage = await prisma.package.findUnique({
        where: { id: parseInt(packageId) }
      });

      if (!newPackage) {
        return res.status(404).json({
          success: false,
          error: 'Package not found',
          message: 'No package found with the specified ID'
        });
      }
      packageData = newPackage;
    }

    // Verify barber exists if being updated
    if (barberId && barberId !== existingAppointment.barberId) {
      const barber = await prisma.user.findUnique({
        where: { 
          id: parseInt(barberId),
          role: { in: ['Boss', 'Staff'] },
          isActive: true
        }
      });

      if (!barber) {
        return res.status(404).json({
          success: false,
          error: 'Barber not found',
          message: 'No active barber found with the specified ID'
        });
      }
    }

    // Calculate new prices
    let originalPrice = packageData.price;
    const updatedAdditionalPackages = additionalPackages !== undefined ? additionalPackages : existingAppointment.additionalPackages;

    if (updatedAdditionalPackages && Array.isArray(updatedAdditionalPackages) && updatedAdditionalPackages.length > 0) {
      const additionalPackagesData = await prisma.package.findMany({
        where: { id: { in: updatedAdditionalPackages.map((id: any) => parseInt(id)) } }
      });

      if (additionalPackagesData.length !== updatedAdditionalPackages.length) {
        return res.status(404).json({
          success: false,
          error: 'Some additional packages not found',
          message: 'One or more additional packages could not be found'
        });
      }

      originalPrice += additionalPackagesData.reduce((sum, pkg) => sum + pkg.price, 0);
    }

    // Handle discount code changes
    let discountCodeData: any = null;
    let discountAmount = 0;
    let finalPrice = originalPrice;
    let newDiscountCodeId = existingAppointment.discountCodeId;

    // If removing discount
    if (removeDiscount) {
      newDiscountCodeId = null;
      discountAmount = 0;
      finalPrice = originalPrice;

      // Remove existing discount usage if exists
      if (existingAppointment.discountCodeId) {
        await prisma.discountCodeUsage.deleteMany({
          where: {
            discountCodeId: existingAppointment.discountCodeId,
            clientId: existingAppointment.clientId,
            appointmentId: appointmentId
          }
        });
      }
    }
    // If adding/changing discount code
    else if (discountCode) {
      discountCodeData = await prisma.discountCode.findUnique({
        where: { 
          code: discountCode,
          isActive: true 
        }
      });

      if (discountCodeData) {
        const targetClientId = clientId ? parseInt(clientId) : existingAppointment.clientId;
        
        // Check if client has already used this discount code (excluding current appointment)
        const existingUsage = await prisma.discountCodeUsage.findFirst({
          where: {
            discountCodeId: discountCodeData.id,
            clientId: targetClientId,
            appointmentId: { not: appointmentId }
          }
        });

        if (existingUsage) {
          return res.status(400).json({
            success: false,
            error: 'Discount code already used',
            message: 'This client has already used this discount code'
          });
        }

        // Check if discount applies to any of the selected packages (if applicablePackages is set)
        if (discountCodeData.applicablePackages && discountCodeData.applicablePackages.length > 0) {
          const targetPackageId = packageId ? parseInt(packageId) : existingAppointment.packageId;
          const targetAdditionalPackages = additionalPackages || existingAppointment.additionalPackages || [];
          
          // Check if base package is applicable
          const basePackageApplicable = discountCodeData.applicablePackages.includes(targetPackageId);
          
          // Check additional packages
          const applicableAdditionalPackages = targetAdditionalPackages.filter((id: any) => 
            discountCodeData.applicablePackages.includes(id)
          );
          
          if (!basePackageApplicable && applicableAdditionalPackages.length === 0) {
            return res.status(400).json({
              success: false,
              error: 'Discount not applicable',
              message: 'This discount code does not apply to any of the selected packages'
            });
          }
        }

        // Calculate discount amount based on selected packages
        let discountableAmount = 0;

        // Add base package if selected for discount
        if (discountAppliedTo?.basePackage) {
          const basePackage = await prisma.package.findUnique({
            where: { id: packageId ? parseInt(packageId) : existingAppointment.packageId }
          });
          if (basePackage) {
            discountableAmount += basePackage.price;
          }
        }
        
        // Add selected additional packages
        if (discountAppliedTo?.additionalPackages && Array.isArray(discountAppliedTo.additionalPackages)) {
          const selectedAdditionalPackages = await prisma.package.findMany({
            where: { id: { in: discountAppliedTo.additionalPackages } }
          });
          discountableAmount += selectedAdditionalPackages.reduce((sum, pkg) => sum + pkg.price, 0);
        }
        
        // Calculate discount only on selected packages
        discountAmount = Math.round((discountableAmount * discountCodeData.discountPercent / 100) * 100) / 100;
        finalPrice = originalPrice - discountAmount;
        newDiscountCodeId = discountCodeData.id;

        // Handle discount usage record updates
        if (existingAppointment.discountCodeId !== discountCodeData.id) {
          // Remove old discount usage if different discount code
          if (existingAppointment.discountCodeId) {
            await prisma.discountCodeUsage.deleteMany({
              where: {
                discountCodeId: existingAppointment.discountCodeId,
                clientId: existingAppointment.clientId,
                appointmentId: appointmentId
              }
            });
          }

          // Create new discount usage record
          try {
            await prisma.discountCodeUsage.create({
              data: {
                discountCodeId: discountCodeData.id,
                clientId: targetClientId,
                appointmentId: appointmentId
              }
            });
          } catch (error: any) {
            // If unique constraint fails, try to update existing record
            if (error.code === 'P2002') {
              await prisma.discountCodeUsage.updateMany({
                where: {
                  discountCodeId: discountCodeData.id,
                  clientId: targetClientId
                },
                data: {
                  appointmentId: appointmentId
                }
              });
            } else {
              throw error;
            }
          }
        }
        // If same discount code, no need to update usage record
      } else {
        return res.status(404).json({
          success: false,
          error: 'Invalid discount code',
          message: 'Discount code not found or inactive'
        });
      }
    }
    // Handle multiple discount codes (new feature)
    else if (multipleDiscountCodes && Array.isArray(multipleDiscountCodes) && multipleDiscountCodes.length > 0) {
      try {
        const targetClientId = clientId ? parseInt(clientId) : existingAppointment.clientId;
        const targetPackageId = packageId ? parseInt(packageId) : existingAppointment.packageId;
        const targetAdditionalPackages = additionalPackages || existingAppointment.additionalPackages || [];

        // Clear existing appointment discounts
        await prisma.appointmentDiscount.deleteMany({
          where: { appointmentId: appointmentId }
        });

        // Clear existing discount usages for this appointment
        await prisma.discountCodeUsage.deleteMany({
          where: { appointmentId: appointmentId }
        });

        const { appliedDiscounts, totalDiscountAmount } = await applyMultipleDiscounts(
          appointmentId,
          multipleDiscountCodes,
          targetClientId,
          targetPackageId,
          targetAdditionalPackages.map((id: any) => parseInt(id))
        );

        // Create new AppointmentDiscount records
        for (const discount of appliedDiscounts) {
          await prisma.appointmentDiscount.create({
            data: {
              appointmentId: appointmentId,
              discountCodeId: discount.discountCodeId,
              appliedToPackages: discount.appliedToPackages,
              discountAmount: discount.discountAmount
            }
          });

          // Create DiscountCodeUsage record
          await prisma.discountCodeUsage.create({
            data: {
              discountCodeId: discount.discountCodeId,
              clientId: targetClientId,
              appointmentId: appointmentId
            }
          });
        }

        discountAmount = totalDiscountAmount;
        finalPrice = originalPrice - totalDiscountAmount;
        newDiscountCodeId = null; // Clear legacy discount code ID when using multiple
      } catch (error: any) {
        return res.status(400).json({
          success: false,
          error: 'Failed to apply discount codes',
          message: error.message
        });
      }
    }
    // Keep existing discount if no changes
    else if (existingAppointment.discountCodeId) {
      newDiscountCodeId = existingAppointment.discountCodeId;
      discountAmount = existingAppointment.discountAmount || 0;
      finalPrice = originalPrice - discountAmount;
    }

    // Update appointment
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        ...(clientId && { clientId: parseInt(clientId) }),
        ...(packageId && { packageId: parseInt(packageId) }),
        ...(barberId !== undefined && { barberId: barberId ? parseInt(barberId) : null }),
        ...(appointmentDate !== undefined && { 
          appointmentDate: appointmentDate ? new Date(appointmentDate) : null 
        }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(updatedAdditionalPackages !== undefined && { additionalPackages: updatedAdditionalPackages }),
        originalPrice: originalPrice,
        finalPrice: finalPrice,
        discountCodeId: newDiscountCodeId,
        discountAmount: discountAmount || null
      },
      include: {
        client: {
          select: {
            clientId: true,
            fullName: true,
            phoneNumber: true
          }
        },
        package: {
          select: {
            name: true,
            description: true,
            price: true,
            duration: true,
            barber: true
          }
        },
        barber: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: updatedAppointment,
      message: 'Appointment updated successfully'
    });
  } catch (error) {
    console.error('Error editing appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to edit appointment',
      message: 'Internal server error'
    });
  }
};

export const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const appointmentId = parseInt(req.params.id);

    if (isNaN(appointmentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid appointment ID',
        message: 'Appointment ID must be a valid number'
      });
    }

    // Check user authorization - only Boss can delete appointment
    if ((req as any).user) {
      const currentUser = await prisma.user.findUnique({
        where: { id: (req as any).user.userId },
        select: { id: true, role: true }
      });
      
      if (currentUser?.role !== 'Boss') {
        return res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: 'Only Boss can delete appointments'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Check if appointment exists
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
        message: 'No appointment found with the specified ID'
      });
    }

    // Delete appointment
    await prisma.appointment.delete({
      where: { id: appointmentId }
    });

    res.json({
      success: true,
      message: 'Appointment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete appointment',
      message: 'Internal server error'
    });
  }
};

export const getClientAppointments = async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);

    if (isNaN(clientId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid client ID',
        message: 'Client ID must be a valid number'
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: {
        package: {
          select: {
            name: true,
            description: true,
            price: true,
            duration: true,
            barber: true,
            imageUrl: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: appointments,
      message: 'Client appointments retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching client appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client appointments',
      message: 'Internal server error'
    });
  }
};
