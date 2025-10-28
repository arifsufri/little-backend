# Little Barbershop - Backend API

Complete backend API for the Little Barbershop Management System built with Node.js, Express, Prisma, and PostgreSQL.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **User Management**: Boss, Staff, and Client roles with account activation system
- **Appointment System**: Complete booking system with barber selection and multiple services
- **Client Management**: QR-based client registration and management
- **Package Management**: Service packages with pricing and duration
- **File Upload**: Avatar and image upload functionality
- **Database**: PostgreSQL with Prisma ORM

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT
- **File Upload**: Multer
- **Validation**: Custom middleware
- **Containerization**: Docker

## 📋 API Endpoints

### Authentication
- `POST /auth/register` - Staff registration (requires activation)
- `POST /auth/register-boss` - Boss registration (auto-activated)
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user
- `PUT /auth/users/:id/role` - Update user role (Boss/Staff only)
- `PUT /auth/users/:id/status` - Activate/deactivate user (Boss only)
- `DELETE /auth/users/:id` - Delete user (Boss only)

### Users
- `GET /users` - Get all users (authenticated)
- `GET /users/barbers` - Get active barbers (public)
- `GET /users/:id` - Get user by ID
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Clients
- `POST /clients/register` - Client registration via QR
- `POST /clients/login` - Client login
- `GET /clients` - Get all clients (authenticated)
- `POST /clients` - Create client manually (authenticated)

### Appointments
- `POST /appointments` - Create appointment (public for QR booking)
- `GET /appointments` - Get all appointments (authenticated)
- `GET /appointments/:id` - Get appointment by ID
- `PUT /appointments/:id` - Update appointment status
- `DELETE /appointments/:id` - Delete appointment

### Packages
- `GET /packages` - Get all packages (public)
- `POST /packages` - Create package (authenticated)
- `PUT /packages/:id` - Update package
- `DELETE /packages/:id` - Delete package

## 🔧 Installation & Setup

### Prerequisites
- Node.js 18+
- PostgreSQL
- Docker (optional)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/arifsufri/little-backend.git
   cd little-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Database Setup**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

### Docker Setup

1. **Using Docker Compose** (from parent directory)
   ```bash
   docker compose up little-backend
   ```

## 🗄️ Database Schema

### User Roles
- **Boss**: Full system access, can manage all users
- **Staff**: Can manage appointments and clients, requires Boss activation
- **Client**: QR booking access only

### Key Models
- **User**: System users with role-based permissions
- **Client**: QR booking clients
- **Package**: Service packages with pricing
- **Appointment**: Bookings with barber selection and multiple services

## 🔐 Authentication Flow

1. **Staff Registration**: Creates inactive account, requires Boss activation
2. **Boss Registration**: Auto-activated with full permissions
3. **Client Registration**: Via QR system, immediate access to booking
4. **JWT Tokens**: Include user role and activation status

## 🌟 Enhanced Features

- **Barber Selection**: Clients can choose specific barbers
- **Multiple Services**: Add multiple packages to single appointment
- **Price Calculation**: Automatic total calculation with additional services
- **Account Activation**: Boss approval system for staff accounts
- **File Uploads**: Avatar and package image support
- **Role-Based Access**: Granular permissions based on user roles

## 📝 Environment Variables

```env
DATABASE_URL="postgresql://username:password@localhost:5432/little_barbershop"
JWT_SECRET="your-jwt-secret"
PORT=4000
```

## 🚀 Deployment

The backend is containerized and ready for deployment with Docker. Configure your production database and environment variables accordingly.

## 📄 License

This project is part of the Little Barbershop Management System.
