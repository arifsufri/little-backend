import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Utility function to generate client ID.
const generateClientId = async (): Promise<string> => {
  const lastClient = await prisma.client.findFirst({
    orderBy: { id: 'desc' }
  });
  
  const nextNumber = lastClient ? lastClient.id + 1 : 1;
  return `LITTLEC${nextNumber}`;
};

// Utility function to validate Malaysian phone number
const validateMalaysianPhone = (phoneNumber: string): boolean => {
  // Malaysian phone format: 01XXXXXXXX (11 digits starting with 01)
  const phoneRegex = /^01[0-9]{8,9}$/;
  return phoneRegex.test(phoneNumber);
};

export const registerClient = async (req: Request, res: Response) => {
  try {
    const { fullName, phoneNumber } = req.body;

    if (!fullName || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Full name and phone number are required'
      });
    }

    // Validate Malaysian phone number format
    if (!validateMalaysianPhone(phoneNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number',
        message: 'Phone number must be in Malaysian format (01XXXXXXXX)'
      });
    }

    // Check if client already exists with this phone number
    const existingClient = await prisma.client.findUnique({
      where: { phoneNumber }
    });

    if (existingClient) {
      return res.status(409).json({
        success: false,
        error: 'Client already exists',
        message: 'A client with this phone number already exists',
        clientExists: true
      });
    }

    // Generate unique client ID
    const clientId = await generateClientId();

    // Create new client
    const newClient = await prisma.client.create({
      data: {
        clientId,
        fullName,
        phoneNumber
      }
    });

    res.status(201).json({
      success: true,
      data: {
        client: {
          id: newClient.id,
          clientId: newClient.clientId,
          fullName: newClient.fullName,
          phoneNumber: newClient.phoneNumber,
          createdAt: newClient.createdAt
        }
      },
      message: 'Client registered successfully'
    });
  } catch (error) {
    console.error('Error registering client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register client',
      message: 'Internal server error'
    });
  }
};

export const loginClient = async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing phone number',
        message: 'Phone number is required'
      });
    }

    // Validate Malaysian phone number format
    if (!validateMalaysianPhone(phoneNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number',
        message: 'Phone number must be in Malaysian format (01XXXXXXXX)'
      });
    }

    // Find client by phone number
    const client = await prisma.client.findUnique({
      where: { phoneNumber }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found',
        message: 'No client found with this phone number'
      });
    }

    res.json({
      success: true,
      data: {
        client: {
          id: client.id,
          clientId: client.clientId,
          fullName: client.fullName,
          phoneNumber: client.phoneNumber,
          createdAt: client.createdAt
        }
      },
      message: 'Client login successful'
    });
  } catch (error) {
    console.error('Error logging in client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login client',
      message: 'Internal server error'
    });
  }
};

export const getAllClients = async (req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        appointments: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            finalPrice: true,
            package: {
              select: {
                name: true,
                price: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: clients,
      message: 'Clients retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients',
      message: 'Internal server error'
    });
  }
};

export const getClientById = async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.id);

    if (isNaN(clientId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid client ID',
        message: 'Client ID must be a valid number'
      });
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        appointments: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            finalPrice: true,
            package: {
              select: {
                name: true,
                price: true,
                description: true,
                duration: true
              }
            }
          }
        }
      }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found',
        message: 'No client found with the specified ID'
      });
    }

    res.json({
      success: true,
      data: client,
      message: 'Client retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client',
      message: 'Internal server error'
    });
  }
};
