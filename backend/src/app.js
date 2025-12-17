const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const adminRoutes = require('./routes/admin');
const employeeRoutes = require('./routes/employee');
const uploadRoutes = require('./routes/upload');
const notificationRoutes = require('./routes/notifications');

// Import database connection
const connectDB = require('./config/database');

// Initialize Express app
const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting (configurable and disabled in development unless forced on)
const enableRateLimit = (process.env.ENABLE_RATE_LIMIT ?? 'true') !== 'false' && process.env.NODE_ENV !== 'development';

if (enableRateLimit) {
  // General limiter for all API routes
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // default: 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500, // default: 500 requests per window per IP
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Stricter limiter for OTP endpoints to avoid SMS/OTP abuse while keeping general traffic freer
  const otpLimiter = rateLimit({
    windowMs: parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS, 10) || 10 * 60 * 1000, // default: 10 minutes
    max: parseInt(process.env.OTP_RATE_LIMIT_MAX, 10) || 10, // default: 10 OTP requests per window per IP
    message: {
      success: false,
      message: 'Too many OTP requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/send-otp', otpLimiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'CivicConnect API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to CivicConnect API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      issues: '/api/issues',
      admin: '/api/admin',
      upload: '/api/upload',
      notifications: '/api/notifications'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
