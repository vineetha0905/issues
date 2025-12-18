import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, Map, List, Filter, ThumbsUp, MessageCircle, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import IssueMap from './IssueMap';
import apiService from '../services/api';

const NearbyIssues = ({ user }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [viewMode, setViewMode] = useState('map'); // 'map' or 'list'
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [upvotedIssues, setUpvotedIssues] = useState(new Set());
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [radiusKm, setRadiusKm] = useState(5);
  const [userCenter, setUserCenter] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | requesting | granted | denied | error
  const [geoError, setGeoError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

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

  useEffect(() => {
    fetchIssues();
  }, [selectedStatus]);

  // Refresh issues when component becomes visible (e.g., after reporting an issue)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchIssues();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      } catch (_) { /* ignore */ }

      setGeoStatus('requesting');
      
      // Use watchPosition with timeout for better reliability
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
          
          // Fallback: try getCurrentPosition with less strict options
          setTimeout(() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const { latitude, longitude } = pos.coords;
                setUserCenter([latitude, longitude]);
                setGeoStatus('granted');
                setGeoError('');
              },
              () => {}, // Silent fail on fallback
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
          }, 1000);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 20000, 
          maximumAge: 300000 // 5 minutes
        }
      );
      
      // Clear watch after 20 seconds if still running
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

  const fetchIssues = async () => {
    try {
      setLoading(true);
      console.log('Fetching issues...');
      const params = { limit: 50 };
      if (selectedStatus !== 'all') {
        params.status = selectedStatus;
      }
      console.log('API params:', params);
      const response = await apiService.getIssues(params);
      console.log('Raw API response:', response);
      console.log('Response data:', response.data);
      console.log('Response issues:', response.issues);
      
      // Map backend data to frontend format
      const rawIssues = response.data?.issues || response.issues || [];
      console.log('Raw issues from API:', rawIssues);
      
      const mappedIssues = rawIssues.map(issue => {
        console.log('Mapping issue:', issue);
        const mapped = {
          id: issue._id || issue.id,
          title: issue.title,
          description: issue.description,
          location: issue.location?.name || 'Location not specified',
          coordinates: issue.location?.coordinates ? 
            [issue.location.coordinates.latitude, issue.location.coordinates.longitude] : 
            [16.0716, 77.9053], // Default coordinates if not available
          status: issue.status || 'reported',
          priority: issue.priority || 'medium',
          upvotes: issue.upvotedBy?.length || 0,
          category: issue.category,
          timestamp: issue.createdAt || issue.timestamp,
          userId: issue.reportedBy?._id || issue.reportedBy,
          images: issue.images || []
        };
        console.log('Mapped issue:', mapped);
        return mapped;
      });
      
      console.log('Final mapped issues:', mappedIssues);
      setIssues(mappedIssues);
    } catch (error) {
      console.error('Error fetching issues:', error);
      console.log('Falling back to mock data');
      // Fallback to mock data
      setIssues(mockIssues);
    } finally {
      setLoading(false);
    }
  };

  const mockIssues = [
    {
      id: '1',
      title: 'Fire Emergency',
      location: 'Near Your Location',
      coordinates: [16.0716, 77.9053],
      status: 'reported',
      priority: 'urgent',
      upvotes: 15,
      description: 'Fire accident in residential area, immediate attention required',
      category: 'Public Safety',
      timestamp: '2025-01-15T10:30:00Z',
      userId: 'other_user_1'
    },
    {
      id: '2',
      title: 'Broken Street Light',
      location: 'Near Your Location',
      coordinates: [16.0720, 77.9055],
      status: 'in-progress',
      priority: 'high',
      upvotes: 28,
      description: 'Street light has been broken for 3 days causing safety concerns',
      category: 'Street Lighting',
      timestamp: '2025-01-14T14:20:00Z',
      userId: 'other_user_2'
    },
    {
      id: '3',
      title: 'Pothole on Main Road',
      location: 'Near Your Location',
      coordinates: [16.0712, 77.9051],
      status: 'resolved',
      priority: 'medium',
      upvotes: 42,
      description: 'Large pothole causing traffic issues and vehicle damage',
      category: 'Road & Traffic',
      timestamp: '2025-01-13T09:15:00Z',
      userId: 'other_user_3'
    },
    {
      id: '4',
      title: 'Garbage Overflow',
      location: 'Near Your Location',
      coordinates: [16.0718, 77.9057],
      status: 'reported',
      priority: 'medium',
      upvotes: 8,
      description: 'Garbage bin overflowing since Monday, causing foul smell',
      category: 'Garbage & Sanitation',
      timestamp: '2025-01-16T11:45:00Z',
      userId: 'other_user_4'
    },
    {
      id: '5',
      title: 'Water Leakage',
      location: 'Near Your Location',
      coordinates: [16.0714, 77.9054],
      status: 'in-progress',
      priority: 'high',
      upvotes: 35,
      description: 'Water pipe leaking on footpath, creating slippery conditions',
      category: 'Water & Drainage',
      timestamp: '2025-01-12T16:30:00Z',
      userId: 'other_user_5'
    },
    {
      id: '6',
      title: 'Traffic Signal Malfunction',
      location: 'Near Your Location',
      coordinates: [16.0710, 77.9049],
      status: 'reported',
      priority: 'urgent',
      upvotes: 12,
      description: 'Traffic signal not working properly, causing major traffic jams',
      category: 'Road & Traffic',
      timestamp: '2025-01-17T08:20:00Z',
      userId: 'other_user_6'
    }
  ];

  const toRad = (value) => (value * Math.PI) / 180;
  const distanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const filterByRadius = (list, radius) => {
    const [lat, lng] = userCenter || [16.0716, 77.9053];
    return list.filter(item => {
      const [ilat, ilng] = item.coordinates || [];
      if (typeof ilat !== 'number' || typeof ilng !== 'number') return false;
      return distanceKm(lat, lng, ilat, ilng) <= radius;
    });
  };

  const byStatus = selectedStatus === 'all' ? issues : issues.filter(issue => issue.status === selectedStatus);
  const filteredIssues = filterByRadius(byStatus, radiusKm);

  const getStatusBadge = (status) => {
    const statusConfig = {
      'reported': { bg: '#fef2f2', color: '#dc2626', text: 'REPORTED' },
      'in-progress': { bg: '#fef3c7', color: '#d97706', text: 'IN PROGRESS' },
      'resolved': { bg: '#d1fae5', color: '#059669', text: 'RESOLVED' }
    };
    
    const config = statusConfig[status] || statusConfig['reported'];
    return (
      <span style={{
        background: config.bg,
        color: config.color,
        padding: '0.25rem 0.625rem',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: '600',
        letterSpacing: '0.025em'
      }}>
        {config.text}
      </span>
    );
  };

  const getPriorityBadge = (priority) => {
    const priorityConfig = {
      'urgent': { bg: '#fee2e2', color: '#dc2626', text: 'URGENT', fontWeight: '700' },
      'high': { bg: '#fef2f2', color: '#dc2626', text: 'High Priority', fontWeight: '500' },
      'medium': { bg: '#fef3c7', color: '#d97706', text: 'Medium Priority', fontWeight: '500' },
      'low': { bg: '#f0f9ff', color: '#2563eb', text: 'Low Priority', fontWeight: '500' }
    };
    
    const config = priorityConfig[priority] || priorityConfig['medium'];
    return (
      <span style={{
        background: config.bg,
        color: config.color,
        padding: '0.25rem 0.625rem',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: config.fontWeight || '500'
      }}>
        {config.text}
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

  const handleUpvote = (issueId, e) => {
    e.stopPropagation();
    setUpvotedIssues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(issueId)) {
        newSet.delete(issueId);
      } else {
        newSet.add(issueId);
      }
      return newSet;
    });
  };

  const handleMarkerClick = (issue) => {
    navigate(`/issue/${issue.id}`);
  };

  return (
    <div className="form-container nearby-issues-container" style={{ padding: '0' }}>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      
      {/* Header */}
      <div className="nearby-issues-header" style={{ 
        background: 'white',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button 
              onClick={() => navigate('/citizen')}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#1e4359', 
                cursor: 'pointer',
                marginRight: '0.75rem',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <h1 style={{ 
              fontSize: '1.25rem', 
              fontWeight: '700', 
              color: '#1e293b',
              margin: 0
            }}>
              Nearby Issues
            </h1>
          </div>

          {/* View Toggle, Refresh, and Issue Count */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <button
              onClick={fetchIssues}
              disabled={loading}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.5rem',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                color: '#64748b',
                opacity: loading ? 0.5 : 1
              }}
              title="Refresh issues"
            >
              <RefreshCw size={18} style={{ 
                animation: loading ? 'spin 1s linear infinite' : 'none'
              }} />
            </button>
            
            <div style={{ 
              display: 'flex', 
              background: '#f1f5f9',
              borderRadius: '8px',
              padding: '0.25rem',
              gap: '0.25rem'
            }}>
              <button
                onClick={() => setViewMode('map')}
                style={{
                  background: viewMode === 'map' ? 'white' : 'transparent',
                  border: 'none',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: viewMode === 'map' ? '#1e4359' : '#64748b',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  boxShadow: viewMode === 'map' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <Map size={16} />
                Map
              </button>
              <button
                onClick={() => setViewMode('list')}
                style={{
                  background: viewMode === 'list' ? 'white' : 'transparent',
                  border: 'none',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: viewMode === 'list' ? '#1e4359' : '#64748b',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <List size={16} />
                List
              </button>
            </div>
            
            <span style={{ 
              color: '#64748b', 
              fontSize: '0.875rem',
              fontWeight: '500',
              marginLeft: '0.25rem'
            }}>
              {filteredIssues.length} issues
            </span>
          </div>
        </div>

        {/* Status Filter */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap'
        }}>
          {[
            { key: 'all', label: 'All Issues', count: filterByRadius(issues, radiusKm).length },
            { key: 'reported', label: 'Reported', count: filterByRadius(issues.filter(i => i.status === 'reported'), radiusKm).length },
            { key: 'in-progress', label: 'In Progress', count: filterByRadius(issues.filter(i => i.status === 'in-progress'), radiusKm).length },
            { key: 'resolved', label: 'Resolved', count: filterByRadius(issues.filter(i => i.status === 'resolved'), radiusKm).length }
          ].map(filter => (
            <button
              key={filter.key}
              onClick={() => setSelectedStatus(filter.key)}
              style={{
                background: selectedStatus === filter.key ? '#3b82f6' : '#f1f5f9',
                color: selectedStatus === filter.key ? 'white' : '#64748b',
                border: 'none',
                padding: '0.5rem 0.875rem',
                borderRadius: '20px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>

        {/* Radius slider */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          marginBottom: '0.5rem'
        }}>
          <span style={{ color: '#475569', fontSize: '0.875rem', fontWeight: '500', whiteSpace: 'nowrap' }}>
            Radius: {radiusKm} km
          </span>
          <input 
            type="range" 
            min="1" 
            max="20" 
            step="1" 
            value={radiusKm} 
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            style={{ 
              flex: 1,
              height: '6px',
              borderRadius: '3px',
              background: '#e2e8f0',
              outline: 'none'
            }}
          />
          <span style={{ color: '#475569', fontSize: '0.875rem', fontWeight: '500', whiteSpace: 'nowrap' }}>
            {filteredIssues.length} issues
          </span>
        </div>

        {/* Geolocation prompt */}
        {geoStatus !== 'granted' && (
          <div style={{ 
            background: '#fff7ed', 
            border: '1px solid #fed7aa', 
            color: '#9a3412', 
            padding: '0.75rem', 
            borderRadius: '8px', 
            marginTop: '0.75rem',
            fontSize: '0.875rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: '200px' }}>
                {geoStatus === 'requesting' ? 'Requesting your location…' :
                 geoStatus === 'denied' ? 'Location permission denied. Please allow access to show nearby issues.' :
                 geoStatus === 'error' ? (geoError || 'Unable to determine your location.') :
                 'We use your location to show nearby issues.'}
              </span>
              <button onClick={requestLocation} style={{
                background: '#fb923c', 
                color: 'white', 
                border: 'none', 
                padding: '0.5rem 0.875rem', 
                borderRadius: '6px', 
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                whiteSpace: 'nowrap'
              }}>
                Use my location
              </button>
            </div>
            {geoStatus === 'denied' && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                Tip: In your browser address bar, click the location icon and allow access for this site.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {viewMode === 'map' ? (
        <div className="nearby-issues-map-container" style={{ 
          width: '100%', 
          height: 'calc(100vh - 220px)',
          minHeight: '500px',
          position: 'relative',
          zIndex: 1,
          background: '#f8fafc'
        }}>
          <IssueMap
            issues={filteredIssues}
            onMarkerClick={handleMarkerClick}
            center={userCenter || [16.0716, 77.9053]}
            showCenterMarker={true}
          />
        </div>
      ) : (
        <div className="nearby-issues-list" style={{ padding: '1rem 1.5rem', background: '#f8fafc', minHeight: 'calc(100vh - 200px)' }}>
          <div className="nearby-issues-list-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '100%' }}>
            {filteredIssues.map((issue) => {
              const imageUrl = getImageUrl(issue);
              const [lat, lng] = issue.coordinates || [];
              return (
                <div 
                  key={issue.id} 
                  className="nearby-issue-card"
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: '1px solid #e2e8f0'
                  }}
                  onClick={() => navigate(`/issue/${issue.id}`)}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                >
                  {/* Title and Status Badges */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <h3 style={{ 
                      fontSize: '1.1rem', 
                      fontWeight: '600', 
                      color: '#1e293b',
                      margin: 0,
                      flex: 1,
                      minWidth: '200px'
                    }}>
                      {issue.title}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {getStatusBadge(issue.status)}
                      {getPriorityBadge(issue.priority)}
                    </div>
                  </div>

                  {/* Location and Date */}
                  <div style={{ 
                    fontSize: '0.875rem', 
                    color: '#64748b',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    alignItems: 'center'
                  }}>
                    {lat && lng && (
                      <span>
                        Lat: {lat.toFixed(4)}, Lng: {lng.toFixed(4)}
                      </span>
                    )}
                    <span>•</span>
                    <span>
                      {formatDate(issue.timestamp)} - Category: {issue.category || 'General'}
                    </span>
                  </div>

                  {/* Description */}
                  <div style={{ 
                    color: '#475569', 
                    fontSize: '0.9rem',
                    lineHeight: '1.5',
                    marginBottom: '0.75rem'
                  }}>
                    {issue.description}
                  </div>

                  {/* Image */}
                  {imageUrl && (
                    <div style={{ 
                      background: '#f8fafc', 
                      borderRadius: '8px', 
                      overflow: 'hidden',
                      height: '200px',
                      width: '100%',
                      marginBottom: '0.75rem',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center'
                    }}>
                      <img 
                        src={imageUrl}
                        alt={issue.title || 'Issue image'}
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          objectFit: 'cover', 
                          display: 'block' 
                        }}
                        onClick={(e) => { e.stopPropagation(); setPreviewUrl(imageUrl); }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem',
                    justifyContent: 'flex-end',
                    flexWrap: 'wrap'
                  }}>
                    {imageUrl && (
                      <button 
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          color: '#64748b',
                          padding: '0.5rem 0.875rem',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.2s'
                        }}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setPreviewUrl(imageUrl); 
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e2e8f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#f1f5f9';
                        }}
                      >
                        View Image
                      </button>
                    )}
                    <button 
                      style={{
                        background: upvotedIssues.has(issue.id) ? '#3b82f6' : '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        color: upvotedIssues.has(issue.id) ? 'white' : '#64748b',
                        padding: '0.5rem 0.875rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s'
                      }}
                      onClick={(e) => handleUpvote(issue.id, e)}
                      onMouseEnter={(e) => {
                        if (!upvotedIssues.has(issue.id)) {
                          e.currentTarget.style.background = '#e2e8f0';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!upvotedIssues.has(issue.id)) {
                          e.currentTarget.style.background = '#f1f5f9';
                        }
                      }}
                    >
                      <ThumbsUp size={16} />
                      {issue.upvotes + (upvotedIssues.has(issue.id) ? 1 : 0)}
                    </button>
                    
                    <button 
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        color: '#64748b',
                        padding: '0.5rem 0.875rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.info('Comment functionality coming soon!');
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e2e8f0';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f1f5f9';
                      }}
                    >
                      <MessageCircle size={16} />
                      Comment
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredIssues.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ 
                fontSize: '3rem', 
                marginBottom: '1rem',
                opacity: 0.5
              }}>🔍</div>
              <h3 style={{ 
                color: '#64748b', 
                marginBottom: '0.5rem',
                fontWeight: '500'
              }}>
                No Issues Found
              </h3>
              <p style={{ color: '#94a3b8' }}>
                No issues match your current filter. Try changing the status filter.
              </p>
            </div>
          )}
        </div>
      )}
      {previewUrl && (
        <div 
          onClick={() => setPreviewUrl('')}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <img 
            src={previewUrl} 
            alt="Issue"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }}
          />
        </div>
      )}
    </div>
  );
};

export default NearbyIssues;