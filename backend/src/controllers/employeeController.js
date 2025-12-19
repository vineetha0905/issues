const Issue = require('../models/Issue');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

class EmployeeController {
  async listAssignedIssues(req, res) {
    try {
      const { page = 1, limit = 50, status, category, priority } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const user = req.user;
      const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
      
      // Build filter based on role
      const filter = {};

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
              status: { $in: ['escalated', 'in-progress'] },
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
      } else {
        // Fallback for other roles
        filter.assignedTo = user._id;
      }

      // Apply status filter
      if (status && status !== 'all') {
        if (filter.$or) {
          // Add status to all $or conditions
          filter.$or = filter.$or.map(condition => ({
            ...condition,
            status: status
          }));
        } else {
          filter.status = status;
        }
      } else if (!filter.status && !filter.$or) {
        // Default: show all non-resolved issues (only if no $or condition)
        filter.status = { $in: ['reported', 'in-progress', 'escalated'] };
      } else if (filter.$or && !status) {
        // For $or conditions, add status filter to each condition
        filter.$or = filter.$or.map(condition => ({
          ...condition,
          status: { $in: ['reported', 'in-progress', 'escalated'] }
        }));
      }

      // Apply category filter if provided
      if (category && category !== 'all') {
        if (filter.$or) {
          // Add category to all $or conditions
          filter.$or = filter.$or.map(condition => {
            if (condition.category && Array.isArray(condition.category.$in)) {
              // If category already has $in, intersect with provided category
              return {
                ...condition,
                category: { $in: condition.category.$in.filter(c => c === category) }
              };
            }
            return {
              ...condition,
              category: category
            };
          });
        } else {
          if (filter.category && Array.isArray(filter.category.$in)) {
            // Intersect with existing category filter
            filter.category = { $in: filter.category.$in.filter(c => c === category) };
          } else {
            filter.category = category;
          }
        }
      }

      // Apply priority filter if provided
      if (priority && priority !== 'all') {
        filter.priority = priority;
      }

      const issues = await Issue.find(filter)
        .populate('reportedBy', 'name email profileImage')
        .populate('assignedTo', 'name email employeeId role')
        .populate('assignedBy', 'name email employeeId')
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Issue.countDocuments(filter);

      res.json({ 
        success: true, 
        data: { 
          issues,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        } 
      });
    } catch (error) {
      console.error('List assigned issues error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }

  async resolveIssue(req, res) {
    try {
      const { id } = req.params;
      const { latitude, longitude } = req.body;

      const issue = await Issue.findById(id);
      if (!issue) {
        return res.status(404).json({ success: false, message: 'Issue not found' });
      }

      // Authorization: allow if admin OR assigned to user OR role-based access
      const user = req.user;
      const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
      const isAssignedToUser = issue.assignedTo?.toString() === user._id.toString();
      const isAdmin = user.role === 'admin';
      
      let isAuthorized = isAdmin || isAssignedToUser;
      
      if (!isAuthorized && employeeRoles.includes(user.role)) {
        // Check department access
        const userDepartments = user.departments && user.departments.length > 0 
          ? user.departments 
          : (user.department ? [user.department] : []);
        
        if (userDepartments.includes('All') || userDepartments.includes(issue.category)) {
          isAuthorized = true;
        }
        
        // Commissioner can resolve any issue
        if (user.role === 'commissioner') {
          isAuthorized = true;
        }
        
        // Supervisor can resolve escalated issues from their department
        if (user.role === 'supervisor' && issue.status === 'escalated' && 
            issue.assignedRole === 'field-staff' && 
            (userDepartments.includes('All') || userDepartments.includes(issue.category))) {
          isAuthorized = true;
        }
      }
      
      if (!isAuthorized) {
        return res.status(403).json({ success: false, message: 'Not authorized to resolve this issue' });
      }

      // If not assigned or assigned to another but same department, reassign to current employee for accountability
      if (!isAssignedToUser) {
        issue.assignedTo = req.user._id;
        issue.assignedBy = req.user._id;
        issue.assignedAt = new Date();
      }

      // Attach resolved photo if provided via upload middleware
      if (req.file) {
        const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';
        const fileUrl = (process.env.CLOUDINARY_CLOUD_NAME)
          ? req.file.cloudinaryUrl // if upstream middleware sets
          : `${baseUrl}/uploads/${req.file.filename}`;

        issue.resolved = issue.resolved || {};
        issue.resolved.photo = {
          url: fileUrl,
          publicId: req.file.publicId || req.file.filename
        };
      }

      // Validate GPS coordinates are within 10 meters of original issue location
      if (latitude && longitude) {
        const originalLat = issue.location?.coordinates?.latitude;
        const originalLng = issue.location?.coordinates?.longitude;
        
        if (originalLat && originalLng) {
          // Calculate distance using Haversine formula (approximate)
          const R = 6371000; // Earth's radius in meters
          const dLat = (parseFloat(latitude) - originalLat) * Math.PI / 180;
          const dLng = (parseFloat(longitude) - originalLng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(originalLat * Math.PI / 180) * Math.cos(parseFloat(latitude) * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c; // Distance in meters
          
          if (distance > 10) {
            return res.status(400).json({ 
              success: false, 
              message: `Resolved location must be within 10 meters of reported location. Current distance: ${Math.round(distance)}m` 
            });
          }
        }
        
        issue.resolved = issue.resolved || {};
        issue.resolved.location = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude)
        };
      }

      issue.resolvedAt = new Date();
      issue.status = 'resolved';
      issue.resolved = issue.resolved || {};
      issue.resolved.resolvedBy = req.user._id;
      if (issue.createdAt) {
        issue.actualResolutionTime = Math.floor((issue.resolvedAt - issue.createdAt) / (1000 * 60 * 60 * 24));
      }

      await issue.save();

      await notificationService.notifyIssueResolved(issue, req.user);

      res.json({ success: true, message: 'Issue resolved', data: { issue } });
    } catch (error) {
      console.error('Resolve issue error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }
}

module.exports = new EmployeeController();


