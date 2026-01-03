import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import apiService from '../services/api';
import { ArrowLeft, Map, List, MapPin, CheckCircle, User, LogOut, RefreshCw, ExternalLink } from 'lucide-react';
import IssueMap from './IssueMap';

const EmployeeDashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [userCenter, setUserCenter] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle');
  const [geoError, setGeoError] = useState('');

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const resp = await apiService.getEmployeeIssues({ page: 1, limit: 50 });
      const data = resp.data || resp;
      setIssues(data.issues || []);
    } catch (e) {
      toast.error(`Failed to load issues: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    const interval = setInterval(fetchIssues, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    requestLocation();
  }, []);

  const requestLocation = async () => {
    try {
      setGeoError('');
      if (!('geolocation' in navigator)) {
        setGeoStatus('error');
        setGeoError('Geolocation is not supported by this browser.');
        setUserCenter([16.0716, 77.9053]);
        return;
      }
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          if (status.state === 'denied') {
            setGeoStatus('denied');
            setUserCenter([16.0716, 77.9053]);
            return;
          }
        }
      } catch (_) {}
      setGeoStatus('requesting');
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserCenter([latitude, longitude]);
          setGeoStatus('granted');
          setGeoError('');
          navigator.geolocation.clearWatch(watchId);
        },
        (err) => {
          console.warn('Geolocation error:', err);
          let errorMessage = 'Unable to get your location';
          if (err.code === 1) {
            errorMessage = 'Location permission denied. Please allow location access in your browser settings.';
            setGeoStatus('denied');
          } else if (err.code === 2) {
            errorMessage = 'Location unavailable. Please check your device settings.';
            setGeoStatus('error');
          } else if (err.code === 3) {
            errorMessage = 'Location request timed out. Please try again.';
            setGeoStatus('error');
          } else {
            setGeoStatus('error');
          }
          setGeoError(errorMessage);
          setUserCenter([16.0716, 77.9053]);
          navigator.geolocation.clearWatch(watchId);
          setTimeout(() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const { latitude, longitude } = pos.coords;
                setUserCenter([latitude, longitude]);
                setGeoStatus('granted');
                setGeoError('');
              },
              () => {},
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
          }, 1000);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 }
      );
      setTimeout(() => {
        navigator.geolocation.clearWatch(watchId);
      }, 20000);
    } catch (e) {
      console.error('Location request error:', e);
      setGeoStatus('error');
      setGeoError('Unexpected error requesting location. Using default location.');
      setUserCenter([16.0716, 77.9053]);
    }
  };

  const getRadiusByRole = () => {
    if (user?.role === 'commissioner') return 60;
    if (user?.role === 'supervisor') return 20;
    if (user?.role === 'field-staff' || user?.role === 'employee') return 10;
    return 10;
  };

  const toRad = (value) => (value * Math.PI) / 180;
  const distanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const filterByRadius = (list, radius) => {
    const [lat, lng] = userCenter || [16.0716, 77.9053];
    return list.filter(item => {
      const [ilat, ilng] = item.location?.coordinates ? [
        item.location.coordinates.latitude,
        item.location.coordinates.longitude
      ] : [];
      if (typeof ilat !== 'number' || typeof ilng !== 'number') return false;
      return distanceKm(lat, lng, ilat, ilng) <= radius;
    });
  };

  const getImageUrl = (issue) => {
    try {
      if (!issue) return null;
      if (issue.image) return issue.image;
      if (issue.imageUrl) return issue.imageUrl;
      if (Array.isArray(issue.images) && issue.images.length > 0) {
        const first = issue.images[0];
        return typeof first === 'string' ? first : (first?.url || first?.secure_url || first?.secureUrl || null);
      }
      return null;
    } catch (_e) { return null; }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'reported': { bg: 'bg-gray-50', text: 'text-gray-700', label: 'OPEN' },
      'assigned': { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'ASSIGNED' },
      'accepted': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'ACCEPTED' },
      'in-progress': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'IN PROGRESS' },
      'escalated': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'IN PROGRESS' },
      'resolved': { bg: 'bg-green-50', text: 'text-green-700', label: 'COMPLETED' },
      'completed': { bg: 'bg-green-50', text: 'text-green-700', label: 'COMPLETED' },
      'closed': { bg: 'bg-gray-50', text: 'text-gray-700', label: 'CLOSED' }
    };
    const config = statusConfig[status] || statusConfig['reported'];
    return (
      <span className={`${config.bg} ${config.text} px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide`}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const openMaps = (lat, lng) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, '_blank');
  };

  const handleMarkerClick = (issue) => {
    navigate(`/employee/resolve/${issue.id || issue._id}`);
  };

  const getFilteredIssues = () => {
    const unresolvedStatuses = ['reported', 'assigned', 'in-progress', 'escalated'];
    let filtered = issues.filter(i => unresolvedStatuses.includes(i.status));
    
    if (selectedStatus === 'assigned') {
      filtered = filtered.filter(i => i.status === 'reported' || i.status === 'assigned' || i.status === 'accepted');
    } else if (selectedStatus === 'in-progress') {
      // Show accepted and in-progress issues (employee is working on these)
      filtered = filtered.filter(i => i.status === 'accepted' || i.status === 'in-progress' || i.status === 'escalated');
    } else if (selectedStatus === 'completed') {
      return [];
    }
    
    const radius = getRadiusByRole();
    filtered = filterByRadius(filtered, radius);
    
    return filtered;
  };

  const filteredIssues = getFilteredIssues();

  const getStatusCounts = () => {
    const radius = getRadiusByRole();
    const unresolvedStatuses = ['reported', 'assigned', 'accepted', 'in-progress', 'escalated'];
    const unresolvedIssues = issues.filter(i => unresolvedStatuses.includes(i.status));
    const radiusFiltered = filterByRadius(unresolvedIssues, radius);
    return {
      all: radiusFiltered.length,
      assigned: radiusFiltered.filter(i => i.status === 'reported' || i.status === 'assigned' || i.status === 'accepted').length,
      'in-progress': radiusFiltered.filter(i => i.status === 'in-progress' || i.status === 'escalated').length,
      completed: 0
    };
  };

  const statusCounts = getStatusCounts();

  const getDepartmentLabel = () => {
    if (user?.role === 'commissioner') {
      return 'All Departments';
    }
    const depts = user?.departments && user.departments.length > 0 
      ? user.departments 
      : (user?.department ? [user.department] : []);
    return depts.join(', ') || '—';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/employee-login')}
                className="mr-3 p-1 text-gray-700 hover:text-gray-900"
              >
                <ArrowLeft size={20} />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Employee Dashboard</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchIssues}
                disabled={loading}
                className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                title="Refresh issues"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all ${
                    viewMode === 'list' 
                      ? 'bg-white text-blue-700 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List size={16} />
                  List
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all ${
                    viewMode === 'map' 
                      ? 'bg-white text-blue-700 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Map size={16} />
                  Map
                </button>
              </div>
              <span className="text-sm font-medium text-gray-600 ml-1">
                {filteredIssues.length} tasks
              </span>
              <button
                onClick={() => navigate('/employee/profile')}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="Profile"
              >
                <User size={18} />
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('civicconnect_token');
                  localStorage.removeItem('civicconnect_user');
                  setUser && setUser(null);
                  navigate('/employee-login');
                }}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-3 flex-wrap">
            {[
              { key: 'all', label: 'All Tasks' },
              { key: 'assigned', label: 'Assigned' },
              { key: 'in-progress', label: 'In Progress' },
              { key: 'completed', label: 'Completed' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setSelectedStatus(filter.key)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedStatus === filter.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label} ({statusCounts[filter.key]})
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {user?.role === 'commissioner' ? 'Commissioner - All Departments' : `Department: ${getDepartmentLabel()}`}
            </div>
            <div className="text-sm text-gray-500">
              Radius: {getRadiusByRole()} km
            </div>
          </div>

          {geoStatus !== 'granted' && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-900">
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <span className="flex-1">
                  {geoStatus === 'requesting' ? 'Requesting your location…' :
                   geoStatus === 'denied' ? 'Location permission denied. Please allow access to show issues within radius.' :
                   geoStatus === 'error' ? (geoError || 'Unable to determine your location.') :
                   'We use your location to show issues within your radius.'}
                </span>
                <button
                  onClick={requestLocation}
                  className="bg-orange-500 text-white px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap hover:bg-orange-600"
                >
                  Use my location
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'map' ? (
        <div className="w-full h-[calc(100vh-220px)] min-h-[500px] relative z-0 bg-gray-50">
          <IssueMap
            issues={filteredIssues.map(issue => ({
              id: issue._id || issue.id,
              title: issue.title,
              location: issue.location?.name || 'Location not specified',
              coordinates: issue.location?.coordinates ? [
                issue.location.coordinates.latitude,
                issue.location.coordinates.longitude
              ] : null,
              status: issue.status,
              description: issue.description
            })).filter(i => Array.isArray(i.coordinates) && i.coordinates.length === 2)}
            onMarkerClick={handleMarkerClick}
            center={userCenter || (filteredIssues[0]?.location?.coordinates ? [
              filteredIssues[0].location.coordinates.latitude,
              filteredIssues[0].location.coordinates.longitude
            ] : [16.0716, 77.9053])}
            showCenterMarker={true}
          />
        </div>
      ) : (
        <div className="px-6 py-4 bg-gray-50 min-h-[calc(100vh-200px)]">
          <div className="flex flex-col gap-4 max-w-full">
            {filteredIssues.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4 opacity-50">📋</div>
                <h3 className="text-gray-500 mb-2 font-medium">No Tasks Found</h3>
                <p className="text-gray-400">No tasks match your current filter. Try changing the status filter.</p>
              </div>
            ) : (
              filteredIssues.map((issue) => {
                const imageUrl = getImageUrl(issue);
                const [lat, lng] = issue.location?.coordinates ? [
                  issue.location.coordinates.latitude,
                  issue.location.coordinates.longitude
                ] : [];
                return (
                  <div
                    key={issue._id || issue.id}
                    className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <h3 className="text-lg font-semibold text-gray-900 flex-1">
                        {issue.title}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(issue.status)}
                      </div>
                    </div>

                    <div className="text-sm text-gray-500 mb-2 flex flex-wrap gap-2 items-center">
                      {lat && lng && (
                        <>
                          <span className="flex items-center gap-1">
                            <MapPin size={14} />
                            Lat: {lat.toFixed(4)}, Lng: {lng.toFixed(4)}
                          </span>
                          <span>•</span>
                        </>
                      )}
                      <span>{formatDate(issue.createdAt || issue.timestamp)} - Category: {issue.category || 'General'}</span>
                    </div>

                    <p className="text-gray-600 text-sm mb-3 leading-relaxed">
                      {issue.description}
                    </p>

                    {issue.status === 'in-progress' && issue.acceptedBy && (
                      (() => {
                        const acceptedById = typeof issue.acceptedBy === 'object' 
                          ? (issue.acceptedBy._id?.toString() || issue.acceptedBy.toString())
                          : issue.acceptedBy.toString();
                        const currentUserId = (user?.id || user?._id)?.toString();
                        if (acceptedById !== currentUserId) {
                          return (
                            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <p className="text-sm text-yellow-800">
                                <strong>Accepted by another employee</strong>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()
                    )}

                    {imageUrl && (
                      <div className="mb-3 rounded-lg overflow-hidden h-48 w-full bg-gray-100">
                        <img
                          src={imageUrl}
                          alt={issue.title || 'Issue image'}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    )}

                    <div className="flex gap-2 justify-end flex-wrap">
                      {lat && lng && (
                        <button
                          className="px-3.5 py-2 bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                          onClick={() => openMaps(lat, lng)}
                        >
                          <ExternalLink size={16} />
                          Navigate
                        </button>
                      )}
                      <button
                        className="px-3.5 py-2 bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                        onClick={() => navigate(`/issue/${issue._id || issue.id}`)}
                      >
                        View Details
                      </button>
                      {/* Accept Button - Show for OPEN or ASSIGNED status when not yet accepted */}
                      {(issue.status === 'reported' || issue.status === 'assigned') && !issue.acceptedBy && (
                        <button
                          className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await apiService.acceptIssue(issue._id || issue.id);
                              toast.success('Issue accepted successfully');
                              fetchIssues();
                            } catch (error) {
                              const errorMessage = error?.message || error?.error || error?.response?.data?.message || 'Failed to accept issue';
                              toast.error(errorMessage);
                              fetchIssues();
                            }
                          }}
                        >
                          <CheckCircle size={18} />
                          Accept Issue
                        </button>
                      )}
                      
                      {/* Resolve Button - Show for IN_PROGRESS status if current user accepted it */}
                      {issue.status === 'in-progress' && issue.acceptedBy && (
                        (() => {
                          // Handle both populated object and ID string
                          const acceptedById = typeof issue.acceptedBy === 'object' 
                            ? (issue.acceptedBy._id?.toString() || issue.acceptedBy.toString())
                            : issue.acceptedBy.toString();
                          const currentUserId = (user?.id || user?._id)?.toString();
                          
                          if (acceptedById === currentUserId) {
                            return (
                              <button
                                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/employee/resolve/${issue._id || issue.id}`);
                                }}
                              >
                                <CheckCircle size={18} />
                                Resolve Issue
                              </button>
                            );
                          }
                          return null;
                        })()
                      )}
                      
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;
