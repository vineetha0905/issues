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
        // Field Staff: See complaints in their department (either assigned to them OR assigned to department)
        if (user.role === 'field-staff' || user.role === 'employee') {
          // Get user's departments
          const userDepartments = user.departments && user.departments.length > 0 
            ? user.departments 
            : (user.department ? [user.department] : []);
          
          // Show issues that are either:
          // 1. Assigned specifically to this user, OR
          // 2. Assigned to the department (assignedRole set but assignedTo is null/empty) and match user's department
          filter.$or = [
            { assignedTo: user._id }, // Specifically assigned to this user
            {
              // Assigned to department (assignedRole exists but assignedTo is null or not set)
              assignedRole: { $exists: true },
              $or: [
                { assignedTo: null },
                { assignedTo: { $exists: false } }
              ],
              // Must match user's department
              category: userDepartments.includes('All') 
                ? { $exists: true } // If user has 'All', show all department-assigned issues
                : { $in: userDepartments }
            }
          ];
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

      // Status filtering: Show unresolved issues by default, but allow filtering by specific status
      // Unresolved statuses: 'reported', 'in-progress', 'escalated'
      // Note: When an issue is assigned, it gets status 'in-progress', which is included here
      const unresolvedStatuses = ['reported', 'in-progress', 'escalated'];
      
      if (status && status !== 'all') {
        // If specific status requested, use it
        if (status === 'resolved') {
          filter.status = 'resolved';
        } else {
          filter.status = status;
        }
      } else {
        // Default: show only unresolved issues (including newly assigned ones)
        if (filter.$or) {
          // For $or conditions, add unresolved status filter to each condition
          filter.$or = filter.$or.map(condition => ({
            ...condition,
            status: { $in: unresolvedStatuses }
          }));
        } else {
          filter.status = { $in: unresolvedStatuses };
        }
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
        .populate('acceptedBy', 'name email employeeId')
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

  // Accept issue (exclusive lock - only one employee can accept)
  async acceptIssue(req, res) {
    try {
      const { id } = req.params;
      const user = req.user;

      // Verify user is an employee
      const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
      if (!employeeRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only employees can accept issues'
        });
      }

      // Check if issue exists
      const issue = await Issue.findById(id);
      if (!issue) {
        return res.status(404).json({
          success: false,
          message: 'Issue not found'
        });
      }

      // If issue is assigned to a specific employee (not department), only that employee can accept
      if (issue.assignedTo && issue.assignedTo.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'This issue is assigned to another employee. Only the assigned employee can accept it.'
        });
      }

      // Atomic update: only accept if status is 'reported' or 'assigned' and not already accepted
      // Note: 'in-progress' status should not be accepted (only 'reported' and 'assigned' can be accepted)
      const result = await Issue.updateOne(
        {
          _id: id,
          status: { $in: ['reported', 'assigned'] },
          acceptedBy: null, // Ensure it's not already accepted
          $or: [
            { assignedTo: null }, // Department-assigned (assignedRole exists but assignedTo is null)
            { assignedTo: user._id } // Specifically assigned to this user
          ]
        },
        {
          $set: {
            status: 'in-progress', // After acceptance, status becomes 'in-progress'
            acceptedBy: user._id,
            acceptedAt: new Date(),
            // If not already assigned, assign to this employee
            assignedTo: user._id,
            assignedBy: issue.assignedBy || user._id,
            assignedAt: issue.assignedAt || new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        // Re-fetch to check current state
        const currentIssue = await Issue.findById(id);
        if (!currentIssue) {
          return res.status(404).json({
            success: false,
            message: 'Issue not found'
          });
        }

        // Check if already accepted
        if (currentIssue.acceptedBy) {
          return res.status(400).json({
            success: false,
            message: 'This issue has already been accepted by another employee.'
          });
        }

        // Check if status doesn't allow acceptance
        if (!['reported', 'assigned'].includes(currentIssue.status)) {
          return res.status(400).json({
            success: false,
            message: `This issue cannot be accepted. Current status: ${currentIssue.status}. Only 'reported' or 'assigned' issues can be accepted.`
          });
        }
        
        // Check if assigned to someone else
        if (currentIssue.assignedTo && currentIssue.assignedTo.toString() !== user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'This issue is assigned to another employee. Only the assigned employee can accept it.'
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Unable to accept issue. Please try again.'
        });
      }

      // Fetch the updated issue
      const updatedIssue = await Issue.findById(id)
        .populate('reportedBy', 'name email')
        .populate('acceptedBy', 'name email');

      return res.json({
        success: true,
        message: 'Issue accepted successfully',
        data: { issue: updatedIssue }
      });
    } catch (error) {
      console.error('Accept issue error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error accepting issue',
        error: error.message
      });
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

      // STRICT AUTHORIZATION: ONLY the employee who accepted the issue can resolve it
      const user = req.user;
      const isAcceptedByUser = issue.acceptedBy?.toString() === user._id.toString();
      const isAdmin = user.role === 'admin';
      
      // If issue is accepted, ONLY the accepting employee can resolve it (or admin)
      if (issue.acceptedBy) {
        if (!isAdmin && !isAcceptedByUser) {
          return res.status(403).json({ 
            success: false, 
            message: 'Only the employee who accepted this issue can resolve it.' 
          });
        }
      } else {
        // If not accepted yet, issue must be accepted first
        return res.status(400).json({ 
          success: false, 
          message: 'Issue must be accepted before it can be resolved.' 
        });
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

      const oldStatus = issue.status;
      
      // If transitioning to resolved, award points and update status (keep issue visible)
      if (oldStatus !== 'resolved') {
        // Award points first
        if (issue.reportedBy && !issue.pointsAwarded) {
          try {
            const User = require('../models/User');
            const reporter = await User.findById(issue.reportedBy);
            if (reporter) {
              const currentPoints = reporter.points || 0;
              reporter.points = currentPoints + 10;
              await reporter.save();
              issue.pointsAwarded = true;
              console.log(`Awarded +10 points to user ${reporter._id} for resolved issue ${issue._id}. New total: ${reporter.points}`);
            }
          } catch (pointsError) {
            console.error('Error awarding points:', pointsError);
            return res.status(500).json({
              success: false,
              message: 'Failed to award points',
              error: pointsError.message
            });
          }
        }
      }
      
      // Only in-progress issues can be resolved (after employee accepts)
      if (issue.status !== 'in-progress') {
        return res.status(400).json({
          success: false,
          message: `Issue must be in-progress before resolution. Current status: ${issue.status}`
        });
      }

      // Update issue status to resolved and save (do NOT delete - keep visible for citizen)
      issue.resolvedAt = new Date();
      issue.status = 'resolved';
      issue.resolved = issue.resolved || {};
      issue.resolved.resolvedBy = req.user._id;
      if (issue.createdAt) {
        issue.actualResolutionTime = Math.floor((issue.resolvedAt - issue.createdAt) / (1000 * 60 * 60 * 24));
      }

      await issue.save();

      await notificationService.notifyIssueResolved(issue, req.user);

      return res.json({ success: true, message: 'Issue resolved', data: { issue } });
    } catch (error) {
      console.error('Resolve issue error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }
}

module.exports = new EmployeeController();


