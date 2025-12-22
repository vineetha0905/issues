const User = require('../models/User');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');

class AuthController {
  // Register a new user
  async register(req, res) {
    try {
      const { name, aadhaarNumber, mobile, email, password, address } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          ...(aadhaarNumber ? [{ aadhaarNumber }] : []),
          ...(email ? [{ email }] : []),
          ...(mobile ? [{ mobile }] : [])
        ]
      });

      // Prevent Aadhaar conflicts with other accounts
      if (aadhaarNumber) {
        const aadhaarConflict = await User.findOne({
          aadhaarNumber,
          ...(existingUser ? { _id: { $ne: existingUser._id } } : {})
        });
        if (aadhaarConflict) {
          return res.status(400).json({
            success: false,
            message: 'Aadhaar number is already linked to another account'
          });
        }
      }

      if (existingUser) {
        // Allow upgrading an existing lightweight account (e.g., created via OTP mobile flow)
        // If Aadhaar is already linked to another user, prevent conflict
        if (
          aadhaarNumber &&
          existingUser.aadhaarNumber &&
          existingUser.aadhaarNumber !== aadhaarNumber
        ) {
          return res.status(400).json({
            success: false,
            message: 'Aadhaar number is already linked to another account'
          });
        }

        existingUser.name = name || existingUser.name;
        if (aadhaarNumber) existingUser.aadhaarNumber = aadhaarNumber;
        if (mobile) existingUser.mobile = mobile;
        if (email) existingUser.email = email;
        if (password) existingUser.password = password;
        if (address) {
          if (typeof address === 'string') {
            existingUser.address = { ...(existingUser.address || {}), street: address };
          } else if (address.street || address.city || address.state || address.pincode) {
            existingUser.address = { ...(existingUser.address || {}), ...address };
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
        // store as simple string in address.street for compatibility
        if (typeof address === 'string') {
          user.address = { street: address };
        } else if (address.street || address.city || address.state || address.pincode) {
          user.address = address;
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
      user.loginCount += 1;
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

      // Simple admin authentication (in production, use proper admin management)
      if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        // Find or create admin user
        let adminUser = await User.findOne({ role: 'admin' });
        
        if (!adminUser) {
          adminUser = new User({
            name: 'Admin User',
            email: process.env.ADMIN_EMAIL,
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
          department: department || 'Road & Traffic',
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
      user.loginCount += 1;
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
