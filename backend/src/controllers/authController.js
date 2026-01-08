const User = require('../models/User');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');

class AuthController {
  // Helper function to clean address object - removes undefined values, especially coordinates
  cleanAddress(addressObj) {
    if (!addressObj || typeof addressObj !== 'object') return null;
    
    const clean = {};
    
    // Only include defined, non-empty string values
    if (addressObj.street && typeof addressObj.street === 'string' && addressObj.street.trim()) {
      clean.street = addressObj.street.trim();
    }
    if (addressObj.city && typeof addressObj.city === 'string' && addressObj.city.trim()) {
      clean.city = addressObj.city.trim();
    }
    if (addressObj.state && typeof addressObj.state === 'string' && addressObj.state.trim()) {
      clean.state = addressObj.state.trim();
    }
    if (addressObj.pincode && typeof addressObj.pincode === 'string' && addressObj.pincode.trim()) {
      clean.pincode = addressObj.pincode.trim();
    }
    
    // Only include coordinates if both latitude and longitude are valid numbers
    // Explicitly check for undefined and null to avoid any issues
    if (addressObj.coordinates && 
        typeof addressObj.coordinates === 'object' &&
        addressObj.coordinates !== null &&
        typeof addressObj.coordinates.latitude === 'number' && 
        typeof addressObj.coordinates.longitude === 'number' &&
        !isNaN(addressObj.coordinates.latitude) &&
        !isNaN(addressObj.coordinates.longitude) &&
        addressObj.coordinates.latitude !== null &&
        addressObj.coordinates.longitude !== null) {
      clean.coordinates = {
        latitude: addressObj.coordinates.latitude,
        longitude: addressObj.coordinates.longitude
      };
    }
    
    return Object.keys(clean).length > 0 ? clean : null;
  }

  // Register a new user
  async register(req, res) {
    try {
      const { name, aadhaarNumber, mobile, email, password, address } = req.body;

      // Check if user already exists by mobile (primary identifier)
      let existingUser = null;
      if (mobile) {
        existingUser = await User.findOne({ mobile });
      }

      // Check for Aadhaar conflicts - only fail if Aadhaar belongs to a different user
      if (aadhaarNumber) {
        const aadhaarUser = await User.findOne({ aadhaarNumber });
        if (aadhaarUser) {
          // Found a user with this Aadhaar number
          if (existingUser) {
            // We also have an existing user by mobile
            if (aadhaarUser._id.toString() !== existingUser._id.toString()) {
              // Different users - this is a conflict!
              // The Aadhaar belongs to user A, but mobile belongs to user B
              return res.status(400).json({
                success: false,
                message: 'Aadhaar number is already linked to another account'
              });
            }
            // Same user - allow updating (no conflict)
          } else {
            // No existing user by mobile, but found user by Aadhaar
            // Check if the mobile numbers match (same person)
            if (aadhaarUser.mobile && aadhaarUser.mobile !== mobile) {
              // Different mobile number - this Aadhaar belongs to someone else
              return res.status(400).json({
                success: false,
                message: 'Aadhaar number is already linked to another account'
              });
            }
            // Same mobile or no mobile on the Aadhaar account - use this user
            existingUser = aadhaarUser;
          }
        }
      }

      // If user exists (by mobile or Aadhaar), allow updating their information
      if (existingUser) {
        console.log('Found existing user, allowing registration/update to proceed');

        existingUser.name = name || existingUser.name;
        if (aadhaarNumber) existingUser.aadhaarNumber = aadhaarNumber;
        if (mobile) existingUser.mobile = mobile;
        if (email) existingUser.email = email;
        if (password) existingUser.password = password;
        if (address) {
          // Always clean and set address properly to avoid undefined coordinate issues
          let cleanAddress;
          if (typeof address === 'string') {
            // Convert existing address to plain object to avoid Mongoose subdocument issues
            const existingAddr = existingUser.address ? 
              (existingUser.address.toObject ? existingUser.address.toObject() : existingUser.address) : 
              null;
            const existingClean = this.cleanAddress(existingAddr) || {};
            cleanAddress = { ...existingClean, street: address };
          } else {
            // Convert existing address to plain object to avoid Mongoose subdocument issues
            const existingAddr = existingUser.address ? 
              (existingUser.address.toObject ? existingUser.address.toObject() : existingUser.address) : 
              null;
            const existingClean = this.cleanAddress(existingAddr) || {};
            const newClean = this.cleanAddress(address) || {};
            cleanAddress = { ...existingClean, ...newClean };
          }
          
          // Final safety check: remove coordinates if they're invalid or undefined
          if (cleanAddress && cleanAddress.coordinates) {
            const lat = cleanAddress.coordinates.latitude;
            const lng = cleanAddress.coordinates.longitude;
            if (lat === undefined || lng === undefined || 
                lat === null || lng === null ||
                typeof lat !== 'number' || typeof lng !== 'number' ||
                isNaN(lat) || isNaN(lng)) {
              delete cleanAddress.coordinates;
            }
          }
          
          // Use set() to properly update the address and avoid validation issues
          if (cleanAddress && Object.keys(cleanAddress).length > 0) {
            existingUser.set('address', cleanAddress);
          } else if (cleanAddress === null) {
            // If address is completely empty, unset it
            existingUser.set('address', undefined);
          }
        }
        existingUser.role = 'citizen';
        existingUser.isVerified = existingUser.isVerified || false;

        try {
          await existingUser.save();
        } catch (err) {
          if (err && err.code === 11000) {
            const dupField = Object.keys(err.keyPattern || {})[0] || 'field';
            return res.status(400).json({
              success: false,
              message: `User already exists with this ${dupField}`
            });
          }
          throw err;
        }

        const token = generateToken(existingUser._id);
        const refreshToken = generateRefreshToken(existingUser._id);

        return res.status(201).json({
          success: true,
          message: 'User registered successfully',
          data: {
            user: existingUser.getProfile(),
            token,
            refreshToken
          }
        });
      }

      // Create new user
      const userData = {
        name,
        aadhaarNumber,
        mobile,
        role: 'citizen'
      };
      
      // Only include optional fields if they are provided
      if (email) userData.email = email;
      if (password) userData.password = password;
      
      const user = new User(userData);

      if (address) {
        // Clean address object before setting
        if (typeof address === 'string') {
          user.address = { street: address };
        } else {
          const cleanAddress = this.cleanAddress(address);
          if (cleanAddress) {
            user.address = cleanAddress;
          }
        }
      }

      try {
        await user.save();
      } catch (err) {
        if (err && err.code === 11000) {
          const dupField = Object.keys(err.keyPattern || {})[0] || 'field';
          return res.status(400).json({
            success: false,
            message: `User already exists with this ${dupField}`
          });
        }
        throw err;
      }

      // Generate OTP for email verification
      if (email) {
        try {
          const otp = user.generateOTP();
          await user.save();

          // Send OTP email (non-blocking - don't fail registration if email fails)
          const emailResult = await emailService.sendOTP(email, otp, name);
          if (!emailResult.success) {
            console.warn('Failed to send OTP email, but registration continues:', emailResult.error);
          }
        } catch (emailError) {
          // Log but don't fail registration if email service fails
          console.error('Error sending OTP email (non-critical):', emailError);
        }
      }

      // Generate tokens
      const token = generateToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: user.getProfile(),
          token,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      console.error('Registration error stack:', error.stack);
      console.error('Registration request body:', req.body);
      
      // Provide more specific error messages
      let errorMessage = 'Server error during registration';
      if (error.name === 'ValidationError') {
        errorMessage = 'Validation error: ' + Object.values(error.errors).map(e => e.message).join(', ');
      } else if (error.name === 'MongoServerError' && error.code === 11000) {
        const dupField = Object.keys(error.keyPattern || {})[0] || 'field';
        errorMessage = `User already exists with this ${dupField}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Login user
  async login(req, res) {
    try {
      const { email, mobile, employeeId, password } = req.body;

      // Find user by email, mobile, or employeeId
      const query = {};
      if (employeeId) {
        query.employeeId = employeeId;
      } else if (email) {
        query.email = email;
      } else if (mobile) {
        query.mobile = mobile;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Email, mobile, or employee ID is required'
        });
      }

      const user = await User.findOne(query).select('+password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Update login info
      user.lastLogin = new Date();
      user.loginCount = (user.loginCount || 0) + 1;
      await user.save();

      // Generate tokens
      const token = generateToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: user.getProfile(),
          token,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during login',
        error: error.message
      });
    }
  }

  // Send OTP
  async sendOTP(req, res) {
    try {
      const { aadhaarNumber, mobile, email } = req.body;
      
      console.log('Send OTP request:', { aadhaarNumber, mobile, email });

      if (!aadhaarNumber && !mobile && !email) {
        return res.status(400).json({
          success: false,
          message: 'Aadhaar number, mobile number or email is required'
        });
      }

      let user;
      
      if (aadhaarNumber) {
        user = await User.findOne({ aadhaarNumber });
      } else if (mobile) {
        user = await User.findOne({ mobile });
      } else {
        user = await User.findOne({ email });
      }

      if (!user) {
        // Only send OTP to registered users
        return res.status(404).json({
          success: false,
          message: 'User not found. Please register before proceeding.'
        });
      } else {
        console.log('Existing user found with ID:', user._id);
      }

      // Generate OTP
      const otp = user.generateOTP();
      console.log('Generated OTP for user:', user._id, 'OTP:', otp);
      await user.save();

      // Send OTP via email or SMS
      if (email) {
        const emailResult = await emailService.sendOTP(email, otp, user.name);
        if (!emailResult.success) {
          return res.status(500).json({
            success: false,
            message: 'Failed to send OTP email',
            error: emailResult.error
          });
        }
      }

      // For mobile, you would integrate with SMS service
      // For now, we'll return the OTP in development
      console.log('NODE_ENV:', process.env.NODE_ENV);
      if (mobile || aadhaarNumber) {
        console.log('Returning OTP in development mode:', otp);
        return res.json({
          success: true,
          message: 'OTP sent successfully',
          data: {
            otp: otp, // Always return OTP for mobile in development
            expiresIn: '5 minutes'
          }
        });
      }

      res.json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: '5 minutes'
        }
      });
    } catch (error) {
      console.error('Send OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error sending OTP',
        error: error.message
      });
    }
  }

  // Verify OTP
  async verifyOTP(req, res) {
    try {
      const { aadhaarNumber, mobile, email, otp } = req.body;
      
      console.log('Verify OTP request:', { aadhaarNumber, mobile, email, otp: otp, otpType: typeof otp });

      if (!aadhaarNumber && !mobile && !email) {
        return res.status(400).json({
          success: false,
          message: 'Aadhaar number, mobile number or email is required'
        });
      }

      let user;
      
      if (aadhaarNumber) {
        user = await User.findOne({ aadhaarNumber });
        console.log('User found by aadhaarNumber:', user ? 'Yes' : 'No');
      } else if (mobile) {
        user = await User.findOne({ mobile });
        console.log('User found by mobile:', user ? 'Yes' : 'No');
      } else {
        user = await User.findOne({ email });
        console.log('User found by email:', user ? 'Yes' : 'No');
      }

      if (!user) {
        console.log('User not found for:', mobile || email);
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      console.log('User OTP data:', { 
        hasOtp: !!user.otp, 
        otpCode: user.otp?.code ? '***' : 'undefined',
        otpExpires: user.otp?.expiresAt 
      });

      // Verify OTP
      const isOTPValid = user.verifyOTP(otp);
      console.log('OTP verification result:', isOTPValid);
      
      if (!isOTPValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      // Clear OTP
      user.otp = undefined;
      user.isVerified = true;
      await user.save();

      // Generate tokens
      const token = generateToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      res.json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          user: user.getProfile(),
          token,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error verifying OTP',
        error: error.message
      });
    }
  }

  // Guest login
  async guestLogin(req, res) {
    try {
      const guestUser = new User({
        name: 'Guest User',
        role: 'guest',
        isGuest: true
      });

      await guestUser.save();

      // Generate tokens
      const token = generateToken(guestUser._id);
      const refreshToken = generateRefreshToken(guestUser._id);

      res.json({
        success: true,
        message: 'Guest login successful',
        data: {
          user: guestUser.getProfile(),
          token,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Guest login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during guest login',
        error: error.message
      });
    }
  }

  // Refresh token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.id);

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Generate new tokens
      const newToken = generateToken(user._id);
      const newRefreshToken = generateRefreshToken(user._id);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        error: error.message
      });
    }
  }

  // Get current user profile
  async getProfile(req, res) {
    try {
      res.json({
        success: true,
        data: {
          user: req.user.getProfile()
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting profile',
        error: error.message
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const { name, email, mobile, address, preferences } = req.body;
      const userId = req.user._id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update fields
      if (name) user.name = name;
      if (email) user.email = email;
      if (mobile) user.mobile = mobile;
      if (address) user.address = address;
      if (preferences) user.preferences = { ...user.preferences, ...preferences };

      await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: user.getProfile()
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating profile',
        error: error.message
      });
    }
  }

  // Logout (invalidate token)
  async logout(req, res) {
    try {
      // In a more sophisticated setup, you would blacklist the token
      // For now, we'll just return success
      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during logout',
        error: error.message
      });
    }
  }

  // Admin login
  async adminLogin(req, res) {
    try {
      const { username, password } = req.body;

      // Get admin credentials from environment or use defaults for local development
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

      // Simple admin authentication (in production, use proper admin management)
      if (username === adminUsername && password === adminPassword) {
        // Find or create admin user
        let adminUser = await User.findOne({ role: 'admin' });
        
        if (!adminUser) {
          adminUser = new User({
            name: 'Admin User',
            email: process.env.ADMIN_EMAIL || 'admin@civicconnect.com',
            role: 'admin',
            isVerified: true,
            isActive: true
          });
          await adminUser.save();
        }

        // Generate tokens
        const token = generateToken(adminUser._id);
        const refreshToken = generateRefreshToken(adminUser._id);

        res.json({
          success: true,
          message: 'Admin login successful',
          data: {
            user: adminUser.getProfile(),
            token,
            refreshToken
          }
        });
      } else {
        res.status(401).json({
          success: false,
          message: 'Invalid admin credentials'
        });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during admin login',
        error: error.message
      });
    }
  }

  // Employee login (using Employee ID)
  async employeeLogin(req, res) {
    try {
      const { employeeId, password } = req.body;

      if (!employeeId || !password) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID and password are required'
        });
      }

      let user = await User.findOne({ employeeId }).select('+password');

      // In development or when demo is allowed, auto-create a demo employee if missing
      const allowDemo = process.env.ALLOW_DEMO_EMPLOYEE !== 'false';
      if (!user && allowDemo) {
        const demo = new User({
          name: 'Demo Employee',
          employeeId,
          role: 'employee',
          department: 'Road & Traffic', // Default department for demo employee
          password: password || 'emp123',
          isVerified: true,
          isActive: true
        });
        await demo.save();
        user = await User.findOne({ _id: demo._id }).select('+password');
      }

      // Check if user is an employee (field-staff, supervisor, commissioner, or legacy 'employee')
      const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
      if (!user || !employeeRoles.includes(user.role)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid employee credentials' 
        });
      }

      if (!user.isActive) {
        return res.status(401).json({ 
          success: false, 
          message: 'Account is deactivated' 
        });
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      user.lastLogin = new Date();
      user.loginCount = (user.loginCount || 0) + 1;
      await user.save();

      const token = generateToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      res.json({
        success: true,
        message: `Welcome, Employee ID: ${user.employeeId}`,
        data: {
          user: user.getProfile(),
          token,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Employee login error:', error);
      res.status(500).json({ success: false, message: 'Server error during employee login', error: error.message });
    }
  }
}

module.exports = new AuthController();
