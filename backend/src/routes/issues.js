const express = require('express');
const router = express.Router();
const issueController = require('../controllers/issueController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const {
  validateIssueCreation,
  validateIssueUpdate,
  validateCommentCreation,
  validateObjectId,
  validatePagination,
  validateIssueFilters
} = require('../middleware/validation');

/* ===============================
   SAFE HANDLER WRAPPER
   (prevents undefined crashes)
================================ */
const safe = (fn) => {
  return (req, res, next) => {
    if (typeof fn !== 'function') {
      return res.status(501).json({
        success: false,
        message: 'Route handler not implemented'
      });
    }
    return fn(req, res, next);
  };
};

/* ===============================
   PUBLIC ROUTES
================================ */
router.get(
  '/',
  validateIssueFilters,
  validatePagination,
  optionalAuth,
  safe(issueController.getIssues)
);

router.get(
  '/nearby',
  safe(issueController.getNearbyIssues)
);

router.get(
  '/stats',
  safe(issueController.getIssueStats)
);

router.get(
  '/leaderboard',
  optionalAuth,
  safe(issueController.getLeaderboard)
);

/* ===============================
   PROTECTED ROUTES
================================ */
router.post(
  '/',
  authenticate,
  validateIssueCreation,
  safe(issueController.createIssue)
);

router.get(
  '/:id',
  validateObjectId('id'),
  optionalAuth,
  safe(issueController.getIssue)
);

router.put(
  '/:id',
  authenticate,
  validateObjectId('id'),
  validateIssueUpdate,
  safe(issueController.updateIssue)
);

router.delete(
  '/:id',
  authenticate,
  validateObjectId('id'),
  safe(issueController.deleteIssue)
);

/* ===============================
   CLOSE ISSUE (Citizen acknowledges resolution)
================================ */
router.put(
  '/:id/close',
  authenticate,
  validateObjectId('id'),
  safe(issueController.closeIssue)
);

/* ===============================
   UPVOTING
================================ */
router.post(
  '/:id/upvote',
  authenticate,
  validateObjectId('id'),
  safe(issueController.upvoteIssue)
);

router.delete(
  '/:id/upvote',
  authenticate,
  validateObjectId('id'),
  safe(issueController.removeUpvote)
);

/* ===============================
   COMMENTS
================================ */
router.get(
  '/:id/comments',
  validateObjectId('id'),
  validatePagination,
  safe(issueController.getIssueComments)
);

router.post(
  '/:id/comments',
  authenticate,
  validateObjectId('id'),
  validateCommentCreation,
  safe(issueController.addComment)
);

/* ===============================
   USER ISSUES
================================ */
router.get(
  '/user/:userId',
  authenticate,
  validateObjectId('userId'),
  validatePagination,
  safe(issueController.getUserIssues)
);

module.exports = router;
