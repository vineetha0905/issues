import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, Calendar, MapPin, ThumbsUp, Eye, Loader2 } from 'lucide-react';
import apiService from '../services/api';
import { getIssueImageUrl, DEFAULT_PLACEHOLDER_IMAGE } from '../utils/imageUtils';

const MyReports = ({ user }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [userIssues, setUserIssues] = useState([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUserIssues();
  }, [user.id]);

  const fetchUserIssues = async () => {
    setIsLoading(true);
    try {
      console.log('Fetching issues for user:', user.id);
      const response = await apiService.getUserIssues(user.id);
      console.log('User issues response:', response);
      let issues = response.data?.issues || response.issues || [];

      // Fallback: if API returns empty, fetch all and filter by user id/mobile
      if (!Array.isArray(issues) || issues.length === 0) {
        console.log('Primary fetch empty; falling back to filtering all issues');
        const allResp = await apiService.getIssues({ limit: 200 });
        const allIssues = allResp.data?.issues || allResp.issues || [];
        const userId = user.id;
        const userMobile = user.phone || user.mobile;
        issues = allIssues.filter((iss) => {
          const rep = iss.reportedBy;
          const repId = typeof rep === 'string' ? rep : rep?._id || rep?.id;
          const repMobile = typeof rep === 'object' ? (rep.mobile || rep.phone) : undefined;
          return (repId && repId === userId) || (userMobile && repMobile && repMobile === userMobile);
        });
      }

      // Debug: log all issues to check image structure
      console.log('[MyReports] Fetched issues count:', issues.length);
      if (issues.length > 0) {
        console.log('[MyReports] First issue full structure:', JSON.stringify(issues[0], null, 2));
        console.log('[MyReports] First issue images array:', issues[0].images);
        console.log('[MyReports] First issue images type:', typeof issues[0].images);
        console.log('[MyReports] First issue images is array?', Array.isArray(issues[0].images));
        if (Array.isArray(issues[0].images) && issues[0].images.length > 0) {
          console.log('[MyReports] First issue images[0]:', issues[0].images[0]);
          console.log('[MyReports] First issue images[0] type:', typeof issues[0].images[0]);
          if (typeof issues[0].images[0] === 'object') {
            console.log('[MyReports] First issue images[0].url:', issues[0].images[0].url);
          }
        }
      }
      
      setUserIssues(issues);
    } catch (error) {
      console.error('Error fetching user issues:', error);
      // Fallback to localStorage if API fails
      const savedIssues = JSON.parse(localStorage.getItem('user_issues') || '[]');
      const filteredIssues = savedIssues.filter(issue => issue.userId === user.id);
      setUserIssues(filteredIssues);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'reported': { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Reported' },
      'in-progress': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'In Progress' },
      'resolved': { bg: 'bg-green-50', text: 'text-green-700', label: 'Resolved' },
      'closed': { bg: 'bg-gray-50', text: 'text-gray-700', label: 'Closed' }
    };
    
    const config = statusConfig[status] || statusConfig['reported'];
    return (
      <span className={`${config.bg} ${config.text} px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide`}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTimeSince = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  };

  return (
    <div className="min-h-screen max-w-full bg-[#f8fafc] px-4 py-6 sm:px-6 sm:py-8 flex justify-center items-start">
      <div className="bg-white p-5 sm:p-6 md:p-8 lg:p-10 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-lg">
        <div className="flex items-center mb-6 sm:mb-8">
          <button 
            onClick={() => navigate('/citizen')}
            className="bg-none border-none text-[#1e4359] cursor-pointer mr-3 sm:mr-4 p-1 hover:opacity-70 transition-opacity"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800">
            {t('myReports')}
          </h1>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-[#1e4359] animate-spin mb-4" />
            <p className="text-gray-600 text-sm sm:text-base font-medium">
              Loading your reports...
            </p>
          </div>
        ) : userIssues.length === 0 ? (
          <div className="text-center py-12 sm:py-16 px-4">
            <div className="text-5xl sm:text-6xl mb-4 opacity-50">📋</div>
            <h3 className="text-gray-600 mb-2 font-medium text-lg sm:text-xl">
              No Reports Yet
            </h3>
            <p className="text-gray-400 mb-6 sm:mb-8 text-sm sm:text-base">
              You haven't reported any issues yet. Start by reporting your first issue!
            </p>
            <button 
              className="bg-gradient-to-r from-[#1e4359] to-[#3f6177] text-white border-none px-6 py-3 sm:px-8 sm:py-4 rounded-xl text-base sm:text-lg font-semibold cursor-pointer transition-all duration-300 hover:shadow-lg hover:transform hover:-translate-y-0.5 font-['Fredoka',sans-serif]"
              onClick={() => navigate('/report-issue')}
            >
              Report Your First Issue
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6">
            {userIssues.map((issue) => (
              <div 
                key={issue._id || issue.id} 
                className="bg-white rounded-2xl p-4 sm:p-5 md:p-6 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all duration-300"
                onClick={() => navigate(`/issue/${issue._id || issue.id}`)}
              >
                {(() => {
                  // Get image URL silently (no console warnings for expected empty arrays)
                  const imageUrl = getIssueImageUrl(issue, true);
                  const hasValidImage = imageUrl !== DEFAULT_PLACEHOLDER_IMAGE;
                  
                  // Check if issue actually has images
                  const hasImagesArray = Array.isArray(issue.images) && issue.images.length > 0;
                  const actualHasImage = hasImagesArray && (
                    (typeof issue.images[0] === 'string' && issue.images[0] && issue.images[0].trim() !== '') ||
                    (typeof issue.images[0] === 'object' && issue.images[0]?.url)
                  );
                  
                  const [lat, lng] = issue.location?.coordinates ? [
                    issue.location.coordinates.latitude,
                    issue.location.coordinates.longitude
                  ] : [];
                  
                  return (
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-shrink-0 w-full sm:w-auto">
                        <div className="bg-gray-50 rounded-lg overflow-hidden h-32 sm:h-36 w-full sm:w-[350px] sm:max-w-[400px] shadow-sm">
                          <img 
                            src={imageUrl}
                            alt={issue.title || 'Issue image'}
                            className="w-full h-full object-cover block"
                            onError={(e) => {
                              // Only log actual load failures, not placeholder displays
                              if (hasValidImage) {
                                console.error('[MyReports] Image failed to load:', imageUrl?.substring(0, 50), 'Issue:', issue._id);
                              }
                              e.target.src = DEFAULT_PLACEHOLDER_IMAGE;
                            }}
                            onClick={(e) => { 
                              if (hasValidImage) {
                                e.stopPropagation(); 
                                setPreviewUrl(imageUrl); 
                              }
                            }}
                          />
                        </div>
                        {/* Only show "View Image" button if there's an actual image */}
                        {hasValidImage && (
                          <div className="flex justify-end mt-2">
                            <button 
                              className="bg-transparent text-[#1e4359] border-2 border-[#1e4359] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-300 hover:bg-[#1e4359] hover:text-white"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setPreviewUrl(imageUrl); 
                              }}
                            >
                              View Image
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-4 gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                              {issue.title}
                            </h3>
                            <div className="text-xs sm:text-sm text-gray-600 flex items-center gap-1 mb-1">
                              <MapPin size={12} className="inline" />
                              {lat && lng ? `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` : (issue.location?.name || 'Location not specified')}
                            </div>
                            <div className="text-xs text-gray-400 flex items-center gap-2">
                              <Calendar size={12} />
                              {formatDate(issue.createdAt || issue.timestamp)} • {getTimeSince(issue.createdAt || issue.timestamp)}
                            </div>
                          </div>
                          {getStatusBadge(issue.status)}
                        </div>

                        <div className="text-gray-600 text-sm sm:text-base mb-4 leading-relaxed">
                          {issue.description}
                        </div>

                        {issue.status === 'resolved' && issue.resolved?.photo?.url && (
                          <div className="mb-4">
                            <div className="text-xs sm:text-sm text-green-600 mb-2 font-semibold">
                              ✓ Resolved with photo proof
                            </div>
                            <div className="h-28 sm:h-32 rounded-lg overflow-hidden bg-gray-50">
                              <img 
                                src={issue.resolved.photo.url} 
                                alt="Resolution proof" 
                                className="w-full h-full object-cover" 
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-gray-100">
                          <div className="text-xs sm:text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-full inline-block w-fit">
                            {issue.category}
                          </div>

                          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                            <ThumbsUp size={14} />
                            {issue.upvotedBy?.length || 0} upvotes
                          </div>
                        </div>

                        {/* Progress Timeline for In-Progress Items */}
                        {issue.status === 'in-progress' && (
                          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <h4 className="text-sm sm:text-base font-semibold mb-3 text-gray-800">
                              Progress Timeline
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-green-600">Reported</span>
                              </div>
                              <div className="w-4 sm:w-5 h-0.5 bg-green-500" />
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="text-blue-600">In Progress</span>
                              </div>
                              <div className="w-4 sm:w-5 h-0.5 bg-gray-300" />
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-gray-300" />
                                <span className="text-gray-400">Resolved</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Resolution Confirmation for Resolved Items */}
                        {issue.status === 'resolved' && (
                          <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                            <h4 className="text-sm sm:text-base font-semibold mb-2 text-green-800">
                              ✅ Issue Resolved!
                            </h4>
                            <p className="text-xs sm:text-sm text-green-700 mb-4">
                              This issue has been marked as resolved. You can acknowledge and close it when you're satisfied.
                            </p>
                            <button 
                              className="bg-gradient-to-r from-[#1e4359] to-[#3f6177] text-white border-none px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer transition-all duration-300 hover:shadow-md hover:transform hover:-translate-y-0.5 font-['Fredoka',sans-serif]"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm('Are you satisfied with the resolution? This will close the issue.')) {
                                  try {
                                    await apiService.closeIssue(issue._id || issue.id);
                                    fetchUserIssues(); // Refresh the list
                                  } catch (error) {
                                    console.error('Error closing issue:', error);
                                    alert('Failed to close issue. Please try again.');
                                  }
                                }
                              }}
                            >
                              Acknowledge & Close Issue
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
      {previewUrl && (
        <div 
          onClick={() => setPreviewUrl('')}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000]"
        >
          <img 
            src={previewUrl} 
            alt="Issue"
            className="max-w-[90vw] max-h-[90vh] rounded-lg"
          />
        </div>
      )}
    </div>
  );
};

export default MyReports;