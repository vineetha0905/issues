/**
 * Default placeholder image for issues/reports without uploaded images
 * Using a simple data URI for a gray placeholder with icon
 */
export const DEFAULT_PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect fill='%23e5e7eb' width='400' height='300'/%3E%3Ctext fill='%239ca3af' font-family='Arial, sans-serif' font-size='18' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";

/**
 * Checks if a value is a valid, non-null URL string
 * @param {any} value - The value to check
 * @returns {boolean} True if valid URL string
 */
const isValidUrlString = (value) => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'NaN') return false;
  return true;
};

/**
 * Gets the image URL for an issue/report with fallback to placeholder
 * @param {Object} issue - The issue/report object
 * @param {boolean} silent - If true, suppress warnings for expected empty arrays (default: false)
 * @returns {string} Image URL or placeholder URL
 */
export const getIssueImageUrl = (issue, silent = false) => {
  try {
    if (!issue) {
      if (!silent) console.warn('[imageUtils] No issue provided');
      return DEFAULT_PLACEHOLDER_IMAGE;
    }
    
    // CRITICAL: Check images array FIRST (primary source based on Issue model)
    // This is the most common case - images are stored in an array
    if (issue.images !== undefined && issue.images !== null) {
      // Handle case where images might be an object instead of array
      let imagesArray = issue.images;
      
      // If images is an object (not array), try to extract array from common properties
      if (!Array.isArray(issue.images) && typeof issue.images === 'object') {
        // Check if it's a single image object
        if (issue.images.url || issue.images.secure_url || issue.images.imageUrl) {
          imagesArray = [issue.images]; // Wrap single object in array
          if (!silent) console.log('[imageUtils] ⚠ issue.images is object (not array), wrapping it');
        } else if (issue.images.images && Array.isArray(issue.images.images)) {
          // Check if there's an 'images' property inside the object
          imagesArray = issue.images.images;
          if (!silent) console.log('[imageUtils] ⚠ issue.images is object with nested images array');
        } else {
          // Unknown object structure - only log if not silent
          if (!silent) {
            console.warn('[imageUtils] ✗ issue.images is object but no valid structure found:', {
              keys: Object.keys(issue.images).slice(0, 5)
            });
          }
          imagesArray = [];
        }
      }
      
      // Now process as array
      if (Array.isArray(imagesArray) && imagesArray.length > 0) {
        const first = imagesArray[0];
        
        // If first item is a string (URL), use it directly
        if (typeof first === 'string' && isValidUrlString(first)) {
          // Only log in non-silent mode
          if (!silent && process.env.NODE_ENV === 'development') {
            console.log('[imageUtils] ✓ Found image from issue.images[0] (string)');
          }
          return first;
        }
        
        // If first item is an object, extract URL from common properties
        if (typeof first === 'object' && first !== null) {
          // Try multiple possible URL property names (check in order of likelihood)
          const url = first.url || first.secure_url || first.secureUrl || first.imageUrl || first.path || first.src || first.image;
          
          if (isValidUrlString(url)) {
            // Only log in non-silent mode and dev
            if (!silent && process.env.NODE_ENV === 'development') {
              console.log('[imageUtils] ✓ Found image from issue.images[0].url');
            }
            return url;
          } else {
            // Only log warnings if not silent - this indicates a real problem
            if (!silent) {
              console.warn('[imageUtils] ✗ images[0] object exists but no valid URL found:', {
                hasUrl: !!first.url,
                hasSecureUrl: !!first.secure_url,
                objectKeys: Object.keys(first).slice(0, 5)
              });
            }
          }
        }
      }
      // Empty array is expected behavior - don't log warnings
      // Only log if there's an unexpected structure (not an array)
      if (!Array.isArray(imagesArray) && !silent) {
        console.warn('[imageUtils] ✗ issue.images is not a valid array:', {
          type: typeof issue.images,
          constructor: issue.images?.constructor?.name
        });
      }
    }
    
    // Check direct image properties as fallback (image, imageUrl, photo, imagePath)
    if (isValidUrlString(issue.image)) {
      console.log('[imageUtils] ✓ Found image from issue.image');
      return issue.image;
    }
    if (isValidUrlString(issue.imageUrl)) {
      console.log('[imageUtils] ✓ Found image from issue.imageUrl');
      return issue.imageUrl;
    }
    if (isValidUrlString(issue.photo)) {
      console.log('[imageUtils] ✓ Found image from issue.photo');
      return issue.photo;
    }
    if (isValidUrlString(issue.imagePath)) {
      console.log('[imageUtils] ✓ Found image from issue.imagePath');
      return issue.imagePath;
    }
    
    // No image found - this is expected for issues without images
    // Only log debug info if not silent and in development mode
    if (!silent && process.env.NODE_ENV === 'development') {
      // Only log if we actually expected an image (e.g., images array exists but is malformed)
      const hasImagesField = issue.images !== undefined && issue.images !== null;
      if (hasImagesField && !Array.isArray(issue.images)) {
        // Unexpected structure - log this
        console.warn('[imageUtils] ✗ Unexpected images structure:', {
          issueId: issue._id || issue.id,
          imagesType: typeof issue.images,
          constructor: issue.images?.constructor?.name
        });
      }
      // Otherwise, empty array is expected - don't log
    }
    
    // No image found, return placeholder
    return DEFAULT_PLACEHOLDER_IMAGE;
  } catch (error) {
    console.error('[imageUtils] ✗ ERROR getting image URL:', error, 'Issue:', issue);
    return DEFAULT_PLACEHOLDER_IMAGE;
  }
};

