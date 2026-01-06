const Issue = require('../models/Issue');
const Comment = require('../models/Comment');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const { v4: uuidv4 } = require('uuid');

class IssueController {

  // Helper function to normalize image URLs (ensure fully qualified URLs)
  _normalizeImageUrls(issues) {
    const baseUrl = process.env.BACKEND_URL || process.env.BASE_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 5001}`;
    
    return issues.map((issue, index) => {
      // Log first issue for debugging
      if (index === 0) {
        console.log('[Backend] Normalizing images for first issue:', {
          issueId: issue._id || issue.id,
          hasImages: !!issue.images,
          imagesType: typeof issue.images,
          imagesIsArray: Array.isArray(issue.images),
          imagesLength: Array.isArray(issue.images) ? issue.images.length : 'N/A',
          imagesFirst: Array.isArray(issue.images) && issue.images.length > 0 ? issue.images[0] : null,
          baseUrl: baseUrl
        });
      }
      
      // Normalize images array - ensure URLs are fully qualified
      // First, ensure issue.images is always an array (handle edge cases)
      if (!Array.isArray(issue.images)) {
        // If images is an object, try to convert it to array
        if (issue.images && typeof issue.images === 'object') {
          if (issue.images.url || issue.images.secure_url || issue.images.imageUrl) {
            // Single image object - wrap in array
            issue.images = [issue.images];
            if (index === 0) {
              console.log('[Backend] Converted single image object to array:', issue.images);
            }
          } else {
            // Unknown object structure - set to empty array
            if (index === 0) {
              console.warn('[Backend] issue.images is object but no valid image structure found:', Object.keys(issue.images));
            }
            issue.images = [];
          }
        } else {
          // null, undefined, or other - set to empty array
          issue.images = [];
        }
      }
      
      if (Array.isArray(issue.images) && issue.images.length > 0) {
        const normalizedImages = issue.images.map((img, imgIndex) => {
          // If image is already a string URL, keep it as-is or convert to object
          if (typeof img === 'string') {
            const url = img.trim();
            // Be more lenient - accept any non-empty string as valid
            if (url && url !== 'null' && url !== 'undefined' && url !== 'NaN' && url !== '') {
              // If it's already a full URL, use as-is, otherwise try to fix it
              if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
                return { url };
              }
              // Try to prepend baseUrl if it's a relative path
              if (!url.startsWith('/')) {
                return { url: `${baseUrl}/uploads/${url}` };
              }
              return { url: `${baseUrl}${url}` };
            }
            if (index === 0) {
              console.warn(`[Backend] Image ${imgIndex} is invalid string:`, url);
            }
            return null; // Invalid string, filter it out
          }
          
          // If image is an object, ensure it has a valid URL
          if (typeof img === 'object' && img !== null) {
            // Preserve the URL field if it exists - check multiple possible fields
            let url = (img.url || img.secure_url || img.secureUrl || img.imageUrl || img.path || '').trim();
            
            // Be more lenient - accept any non-empty URL
            if (!url || url === 'null' || url === 'undefined' || url === 'NaN' || url === '') {
              if (index === 0) {
                console.warn(`[Backend] Image ${imgIndex} has no URL field:`, Object.keys(img));
              }
              return null; // Filter out invalid images
            }
            
            // Only fix URLs that are clearly incomplete (relative paths or filenames only)
            // Skip if already a full URL (http/https/data URI) or Cloudinary URL
            if (!url.startsWith('http://') && 
                !url.startsWith('https://') && 
                !url.startsWith('data:') &&
                !url.includes('cloudinary.com') &&
                !url.includes('res.cloudinary.com')) {
              // Check if it looks like just a filename (no path separators)
              if (!url.startsWith('/') && !url.includes('/')) {
                url = `${baseUrl}/uploads/${url}`;
              } else if (url.startsWith('/uploads/')) {
                url = `${baseUrl}${url}`;
              } else if (url.startsWith('uploads/')) {
                url = `${baseUrl}/${url}`;
              } else if (url.startsWith('/')) {
                url = `${baseUrl}${url}`;
              } else {
                url = `${baseUrl}/uploads/${url}`;
              }
            }
            
            // Return normalized image object
            const normalized = {
              url: url,
              ...(img.publicId && { publicId: img.publicId }),
              ...(img.caption && { caption: img.caption })
            };
            
            if (index === 0 && imgIndex === 0) {
              console.log('[Backend] Normalized first image:', normalized);
            }
            
            return normalized;
          }
          
          if (index === 0) {
            console.warn(`[Backend] Image ${imgIndex} has unknown type:`, typeof img, img);
          }
          return null; // Unknown format, filter it out
        }).filter(img => img !== null && img.url); // Remove null entries and entries without URLs
        
        // Only update if we have valid images
        if (normalizedImages.length > 0) {
          issue.images = normalizedImages;
          if (index === 0) {
            console.log('[Backend] After normalization, images array:', JSON.stringify(issue.images, null, 2));
          }
        } else {
          if (index === 0) {
            console.warn('[Backend] All images were filtered out during normalization');
          }
          // Keep original images array even if empty - don't delete it
          issue.images = [];
        }
      } else {
        if (index === 0) {
          console.warn('[Backend] Issue has no images array or it is empty:', {
            hasImages: !!issue.images,
            isArray: Array.isArray(issue.images),
            length: Array.isArray(issue.images) ? issue.images.length : 'N/A'
          });
        }
      }
      
      return issue;
    });
  }
  
  // Helper function to validate URL string (similar to frontend)
  // Made more lenient to accept any non-empty string
  _isValidUrlString(value) {
    if (!value || typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'NaN') return false;
    // Accept any non-empty string - let the browser handle URL validation
    return trimmed.length > 0;
  }
  
  // Alias for easier access
  isValidUrlString(value) {
    return this._isValidUrlString(value);
  }

  // ===============================
  // GET ALL ISSUES
  // ===============================
  async getIssues(req, res) {
    try {
      const {
        status,
        category,
        priority,
        assignedTo,
        reportedBy,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 20,
        search,
        latitude,
        longitude,
        radius = 5000
      } = req.query;

      const filter = { isPublic: true };

      // Role-based filtering
      const user = req.user;
      if (user) {
        const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
        if (employeeRoles.includes(user.role)) {
          // Field Staff: Only see complaints assigned to them in their department
          if (user.role === 'field-staff' || user.role === 'employee') {
            filter.assignedTo = user._id;
            // Filter by department
            const userDepartments = user.departments && user.departments.length > 0 
              ? user.departments 
              : (user.department ? [user.department] : []);
            
            if (!userDepartments.includes('All')) {
              filter.category = { $in: userDepartments };
            }
          }
          // Supervisor: See complaints assigned to them + escalated from field-staff
          else if (user.role === 'supervisor') {
            filter.$or = [
              { assignedTo: user._id },
              { 
                assignedRole: 'field-staff',
                status: 'escalated',
                category: { 
                  $in: user.departments && user.departments.length > 0 
                    ? (user.departments.includes('All') ? [] : user.departments)
                    : (user.department && user.department !== 'All' ? [user.department] : [])
                }
              }
            ];
            
            // Filter by department if not 'All'
            const userDepartments = user.departments && user.departments.length > 0 
              ? user.departments 
              : (user.department ? [user.department] : []);
            
            if (!userDepartments.includes('All') && userDepartments.length > 0) {
              if (filter.$or) {
                filter.$or = filter.$or.map(condition => {
                  if (condition.category) {
                    condition.category = { $in: userDepartments };
                  }
                  return condition;
                });
              } else {
                filter.category = { $in: userDepartments };
              }
            }
          }
          // Commissioner: See ALL complaints from ALL departments
          else if (user.role === 'commissioner') {
            // No additional filtering - can see everything
          }
        }
      }

      if (status && status !== 'all') filter.status = status;
      if (category && !filter.category) filter.category = category;
      if (priority) filter.priority = priority;
      if (assignedTo && !filter.assignedTo) filter.assignedTo = assignedTo;
      if (reportedBy) filter.reportedBy = reportedBy;

      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'location.name': { $regex: search, $options: 'i' } }
        ];
      }

      if (latitude && longitude) {
        filter['location.coordinates'] = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: parseInt(radius)
          }
        };
      }

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      let issues = await Issue.find(filter)
        .populate('reportedBy', 'name email profileImage')
        .populate('assignedTo', 'name email profileImage')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(); // Use lean() for better performance

      // Normalize image URLs to ensure they're fully qualified
      issues = this._normalizeImageUrls(issues);

      const total = await Issue.countDocuments(filter);

      res.json({
        success: true,
        data: {
          issues,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit
          }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ===============================
  // GET LEADERBOARD
  // ===============================
  async getLeaderboard(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const currentUserId = req.user?._id?.toString();
      
      // Get top users by points (citizens only)
      // Ensure points field is treated as 0 if null/undefined, and sort by points descending
      const topUsers = await User.find({ 
        role: 'citizen',
        name: { $exists: true, $ne: null }
      })
        .select('name points')
        .sort({ points: -1 })
        .limit(limit)
        .lean();
      
      // Calculate current user's rank and get their data
      let currentUserData = null;
      if (currentUserId) {
        const currentUser = await User.findById(currentUserId)
          .select('name points')
          .lean();
        
        if (currentUser) {
          // Count how many users have more points than current user
          const usersAbove = await User.countDocuments({
            role: 'citizen',
            points: { $gt: currentUser.points || 0 }
          });
          const userRank = usersAbove + 1;
          
          currentUserData = {
            rank: userRank,
            name: currentUser.name,
            points: currentUser.points || 0,
            isCurrentUser: true
          };
        }
      }
      
      // Format response with rank - show ONLY top 10
      // Ensure points are treated as 0 if null/undefined
      const formatted = topUsers.map((user, index) => {
        const userRank = index + 1;
        const userPoints = (user.points !== null && user.points !== undefined) ? user.points : 0;
        return {
          rank: userRank,
          name: user.name || 'Unknown',
          points: userPoints,
          isCurrentUser: currentUserId && user._id.toString() === currentUserId
        };
      });
      
      res.json({
        success: true,
        data: {
          leaderboard: formatted,
          currentUser: currentUserData
        }
      });
    } catch (error) {
      console.error('Get leaderboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching leaderboard',
        error: error.message
      });
    }
  }

  // ===============================
  // CLOSE ISSUE (Citizen acknowledges resolution)
  // ===============================
  async closeIssue(req, res) {
    try {
      const { id } = req.params;
      const issue = await Issue.findById(id);
      
      if (!issue) {
        return res.status(404).json({
          success: false,
          message: 'Issue not found'
        });
      }

      // Only the reporter can close their own resolved issue
      if (issue.reportedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only the reporter can close this issue'
        });
      }

      // Only resolved issues can be closed
      if (issue.status !== 'resolved') {
        return res.status(400).json({
          success: false,
          message: 'Only resolved issues can be closed'
        });
      }

      // Update status to closed and set closedAt timestamp
      issue.status = 'closed';
      issue.closedAt = new Date();
      await issue.save();

      // Delete the issue after it's been closed
      await issue.deleteOne();
      console.log(`Issue ${issue._id} closed and deleted by citizen ${req.user._id}`);

      return res.json({
        success: true,
        message: 'Issue closed successfully',
        data: { deleted: true }
      });
    } catch (error) {
      console.error('Close issue error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error closing issue',
        error: error.message
      });
    }
  }

  // ===============================
  // GET ISSUES FOR A SPECIFIC USER
  // ===============================
  async getUserIssues(req, res) {
    try {
      const { userId } = req.params;
      const {
        status,
        page = 1,
        limit = 20
      } = req.query;

      // Only allow a user to see their own issues, or admins to see anyone's
      if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view these issues'
        });
      }

      const filter = { reportedBy: userId };
      if (status && status !== 'all') {
        filter.status = status;
      }

      const skip = (page - 1) * limit;

      let issues = await Issue.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(); // Use lean() for better performance and to get plain objects

      // Normalize image URLs to ensure they're fully qualified
      issues = this._normalizeImageUrls(issues);

      const total = await Issue.countDocuments(filter);

      return res.json({
        success: true,
        data: {
          issues,
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: Number(limit)
          }
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ===============================
  // GET SINGLE ISSUE
  // ===============================
  async getIssue(req, res) {
    try {
      const issue = await Issue.findById(req.params.id)
        .populate('reportedBy', 'name email profileImage')
        .populate('assignedTo', 'name email profileImage');

      if (!issue) {
        return res.status(404).json({ success: false, message: 'Issue not found' });
      }

      res.json({ success: true, data: { issue } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ===============================
  // CREATE ISSUE (ML INTEGRATED)
  // ===============================
  async createIssue(req, res) {
    try {
      const {
        title,
        description,
        location,
        tags = [],
        isAnonymous = false
      } = req.body;

      // ---------- ML VALIDATION (NON-BLOCKING - OPTIONAL FOR CATEGORY DETECTION) ----------
      let category = req.body.category || 'Other'; // Use provided category or default
      let priority = req.body.priority || 'medium'; // Use provided priority or default
      let mlResult = null;

      // ML validation is now optional - if it fails, we proceed with provided/default category
      if (process.env.ML_API_URL) {
        try {
          const coords = location?.coordinates;
          const latitude = Array.isArray(coords) ? coords[0] : coords?.latitude || null;
          const longitude = Array.isArray(coords) ? coords[1] : coords?.longitude || null;

          // Get image URL from request if available
          let imageUrl = null;
          if (req.body.images && Array.isArray(req.body.images) && req.body.images.length > 0) {
            imageUrl = req.body.images[0].url || null;
          }

          const mlPayload = {
            report_id: uuidv4(),
            description,
            user_id: req.user._id.toString(),
            image_url: imageUrl,
            latitude,
            longitude
          };

          // Set a timeout for ML validation (45 seconds) - increased for Render cold starts
          // Use Promise.race for compatibility
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('ML_TIMEOUT')), 45000)
          );

          try {
            const mlResponse = await Promise.race([
              fetch(process.env.ML_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mlPayload)
              }),
              timeoutPromise
            ]);

            if (mlResponse.ok) {
              const parsed = await mlResponse.json();
              mlResult = parsed;

              // Only reject if ML explicitly rejects the report
              if (mlResult && mlResult.accept === false && mlResult.status === 'rejected') {
                const reason = mlResult.reason || 'Report rejected by validator';
                
                // Deduct points from user for rejected report (only if not already deducted for this report)
                if (req.user && req.user._id) {
                  try {
                    const reporter = await User.findById(req.user._id);
                    if (reporter) {
                      const currentPoints = reporter.points || 0;
                      reporter.points = Math.max(0, currentPoints - 5);
                      await reporter.save();
                      console.log(`Deducted -5 points from user ${reporter._id} for rejected report. New total: ${reporter.points}`);
                    }
                  } catch (pointsError) {
                    console.error('Error deducting points:', pointsError);
                    // Continue with rejection even if points update fails
                  }
                }
                
                return res.status(400).json({
                  success: false,
                  message: reason,
                  reason: reason
                });
              }

              // Use ML-detected category if available
              if (mlResult && mlResult.category) {
                category = mlResult.category;
              }

              // Use ML-detected priority if available
              if (mlResult && mlResult.priority) {
                priority = mlResult.priority === 'urgent' ? 'urgent' : 'medium';
              }
            } else {
              // ML service returned error - log but continue with default category
              console.warn('ML service returned error, using default category:', mlResponse.status);
            }
          } catch (fetchError) {
            // Timeout or network error - log but continue with default category
            if (fetchError.message === 'ML_TIMEOUT') {
              console.warn('ML validation timeout, using default category');
            } else {
              console.warn('ML validation network error, using default category:', fetchError.message);
            }
          }
        } catch (mlError) {
          // Any other ML error - log but continue with default category
          console.warn('ML validation error (non-blocking), using default category:', mlError.message);
        }
      } else {
        // ML_API_URL not configured - use default category (non-blocking)
        console.log('ML_API_URL not configured, using default category');
      }

      // ---------- IMAGE NORMALIZATION ----------
      let images = [];
      try {
        const parsed = typeof req.body.images === 'string'
          ? JSON.parse(req.body.images)
          : req.body.images;

        console.log('[Backend createIssue] Received images:', JSON.stringify(parsed, null, 2));

        if (Array.isArray(parsed)) {
          images = parsed
            .map((img, idx) => {
              // If image is a string URL, convert to object format
              if (typeof img === 'string') {
                console.log(`[Backend createIssue] Image ${idx} is string:`, img);
                return { url: img.trim(), caption: 'Issue image' };
              }
              
              // If image is an object, extract URL and preserve other fields
              if (typeof img === 'object' && img !== null) {
                const url = (img.url || img.secure_url || img.secureUrl || '').trim();
                
                if (!url || !this._isValidUrlString(url)) {
                  console.warn(`[Backend createIssue] Image ${idx} has no valid URL:`, img);
                  return null;
                }
                
                console.log(`[Backend createIssue] Image ${idx} normalized:`, { url, publicId: img.publicId, caption: img.caption });
                
                // Preserve all relevant fields from the image object
                return {
                  url: url,
                  ...(img.publicId && { publicId: img.publicId }),
                  ...(img.caption && { caption: img.caption })
                };
              }
              
              console.warn(`[Backend createIssue] Image ${idx} is invalid type:`, typeof img, img);
              return null;
            })
            .filter(Boolean); // Remove null entries
        }
        
        console.log('[Backend createIssue] Final images array:', JSON.stringify(images, null, 2));
      } catch (error) {
        console.error('[Backend createIssue] Error parsing images:', error);
      }

      if ((!images || images.length === 0) && req.files?.images) {
        console.log('[Backend createIssue] Using files.images instead:', req.files.images);
        images = req.files.images;
      }

      // ---------- SAVE ISSUE ----------
      // Map priority to valid enum values: ['low', 'medium', 'high', 'urgent']
      // Priority is already set above from ML result or default
      const priorityMap = {
        'normal': 'medium',
        'urgent': 'urgent',
        'high': 'high',
        'medium': 'medium',
        'low': 'low'
      };
      const finalPriority = priorityMap[priority?.toLowerCase()] || 'medium';
      
      const issue = new Issue({
        title,
        description,
        category, // Use ML-detected category or provided/default
        location,
        priority: finalPriority,
        tags,
        isAnonymous,
        reportedBy: req.user._id,
        images, // Store images array (already normalized above)
        documents: req.files?.documents || [],
        status: 'reported' // Explicitly set status to 'reported' - must stay 'reported' until employee accepts
      });

      console.log('[Backend createIssue] Saving issue with images:', {
        imagesCount: images.length,
        images: images.map(img => ({ 
          url: img.url ? img.url.substring(0, 60) + '...' : 'NO URL', 
          publicId: img.publicId || 'NO PUBLIC ID',
          caption: img.caption || 'NO CAPTION'
        }))
      });

      await issue.save();
      
      console.log('[Backend createIssue] Issue saved successfully. ID:', issue._id);
      console.log('[Backend createIssue] Saved issue images (from DB):', JSON.stringify(issue.images, null, 2));
      
      await issue.populate('reportedBy', 'name email profileImage');

      // AUTO-ASSIGN TO DEPARTMENT: Automatically assign issue to all employees in the department
      try {
        const issueCategory = category;
        
        // Find all active employees with matching department
        const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
        const departmentEmployees = await User.find({
          role: { $in: employeeRoles },
          isActive: true,
          $or: [
            { departments: { $in: [issueCategory, 'All'] } },
            { department: { $in: [issueCategory, 'All'] } }
          ]
        });

        if (departmentEmployees.length > 0) {
          // Assign to department (not a specific user) - this allows all employees in department to see it
          const assignedRole = 'field-staff';
          
          // Set assignedRole, but leave assignedTo as null and status MUST remain 'reported'
          // CRITICAL: Status must stay 'reported' - only employee acceptance can change it to 'in-progress'
          issue.assignedRole = assignedRole;
          issue.assignedBy = req.user._id; // Admin or system
          issue.assignedAt = new Date();
          // DO NOT change status - keep it as 'reported'
          issue.status = 'reported'; // Ensure status is 'reported' - employees must accept to change to 'in-progress'
          
          // Calculate escalation deadline based on priority and role
          if (issue.priority) {
            const deadline = issue.calculateEscalationDeadline(issue.priority, assignedRole);
            issue.escalationDeadline = deadline;
          }
          
          await issue.save();

          // Notify all employees in the department
          const notificationPromises = departmentEmployees.map(emp => 
            notificationService.notifyIssueAssignment(issue, emp, req.user)
          );
          await Promise.all(notificationPromises);
          
          console.log(`✅ Issue auto-assigned to department "${issueCategory}". ${departmentEmployees.length} employees notified.`);
        } else {
          // No employees found for this department - issue remains unassigned
          // Admins can manually assign it later
          console.log(`⚠️ No active employees found for department "${issueCategory}". Issue will remain unassigned.`);
        }
      } catch (assignError) {
        // Don't fail issue creation if auto-assignment fails
        console.error('Auto-assignment error (non-blocking):', assignError.message);
      }

      await notificationService.notifyAdminsNewIssue(issue, req.user);

      res.status(201).json({
        success: true,
        message: 'Issue created successfully',
        data: { issue, ml: mlResult }
      });

    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ===============================
  // UPDATE ISSUE
  // ===============================
  async updateIssue(req, res) {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) return res.status(404).json({ success: false });

      if (req.user.role !== 'admin' &&
          issue.reportedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false });
      }

      // STRICT RULE: Prevent changing status to 'in-progress' via updateIssue
      // Only employee acceptance can change status from 'reported' to 'in-progress'
      if (req.body.status === 'in-progress' && req.user.role !== 'employee') {
        return res.status(403).json({ 
          success: false,
          message: 'Status cannot be set to in-progress via update. Only employees can accept issues to change status to in-progress.'
        });
      }

      Object.assign(issue, req.body);
      await issue.save();

      res.json({ success: true, data: { issue } });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  }

  // ===============================
  // DELETE ISSUE
  // ===============================
  async deleteIssue(req, res) {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) return res.status(404).json({ success: false });

      await issue.deleteOne();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  }

  // ===============================
  // UPVOTE ISSUE
  // ===============================
  async upvoteIssue(req, res) {
    try {
      const issue = await Issue.findById(req.params.id);
      await issue.upvote(req.user._id);
      res.json({ success: true, upvotes: issue.upvotes });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  }

  async removeUpvote(req, res) {
    try {
      const issue = await Issue.findById(req.params.id);
      await issue.removeUpvote(req.user._id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  }

  // ===============================
  // COMMENTS
  // ===============================
  async getIssueComments(req, res) {
    try {
      const comments = await Comment.getIssueComments(req.params.id);
      res.json({ success: true, data: comments });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  }

  async addComment(req, res) {
    try {
      const comment = new Comment({
        issue: req.params.id,
        author: req.user._id,
        content: req.body.content
      });
      await comment.save();
      res.status(201).json({ success: true, data: comment });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  }
}

module.exports = new IssueController();

