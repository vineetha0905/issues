import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, Calendar, MapPin, ThumbsUp, Eye } from 'lucide-react';
import apiService from '../services/api';

const MyReports = ({ user }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [userIssues, setUserIssues] = useState([]);
  const [previewUrl, setPreviewUrl] = useState('');

  const getImageUrl = (issue) => {
    try {
      if (!issue) return null;
      if (issue.image) return issue.image;
      if (issue.imageUrl) return issue.imageUrl;
      if (Array.isArray(issue.images) && issue.images.length > 0) {
        const first = issue.images[0];
        return typeof first === 'string' ? first : (first?.url || first?.secure_url || null);
      }
      return null;
    } catch (_e) { return null; }
  };

  useEffect(() => {
    fetchUserIssues();
  }, [user.id]);

  const fetchUserIssues = async () => {
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

      setUserIssues(issues);
    } catch (error) {
      console.error('Error fetching user issues:', error);
      // Fallback to localStorage if API fails
      const savedIssues = JSON.parse(localStorage.getItem('user_issues') || '[]');
      const filteredIssues = savedIssues.filter(issue => issue.userId === user.id);
      setUserIssues(filteredIssues);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'reported': { class: 'status-reported', text: 'Reported' },
      'in-progress': { class: 'status-in-progress', text: 'In Progress' },
      'resolved': { class: 'status-resolved', text: 'Resolved' },
      'closed': { class: 'status-closed', text: 'Closed' }
    };
    
    const config = statusConfig[status] || statusConfig['reported'];
    return <span className={`status-badge ${config.class}`}>{config.text}</span>;
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
    <div className="form-container">
      <div className="form-card" style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <button 
            onClick={() => navigate('/citizen')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#1e4359', 
              cursor: 'pointer',
              marginRight: '1rem'
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="form-title">{t('myReports')}</h1>
        </div>

        {userIssues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ 
              fontSize: '3rem', 
              marginBottom: '1rem',
              opacity: 0.5
            }}>📋</div>
            <h3 style={{ 
              color: '#64748b', 
              marginBottom: '0.5rem',
              fontWeight: '500'
            }}>
              No Reports Yet
            </h3>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              You haven't reported any issues yet. Start by reporting your first issue!
            </p>
            <button 
              className="btn-primary" 
              onClick={() => navigate('/report-issue')}
            >
              Report Your First Issue
            </button>
          </div>
        ) : (
          <div className="issues-grid" style={{ gridTemplateColumns: '1fr' }}>
            {userIssues.map((issue) => (
              <div 
                key={issue._id || issue.id} 
                className="issue-card"
                onClick={() => navigate(`/issue/${issue._id || issue.id}`)}
              >
                {(() => {
                  const imageUrl = getImageUrl(issue);
                  return imageUrl ? (
                  <div>
                    <div 
                      className="issue-image"
                      style={{ 
                        background: '#f8fafc', 
                        borderRadius: '8px', 
                        overflow: 'hidden',
                        height: '180px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <img 
                        src={imageUrl}
                        alt={issue.title || 'Issue image'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onClick={(e) => { e.stopPropagation(); setPreviewUrl(imageUrl); }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button 
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        onClick={(e) => { e.stopPropagation(); setPreviewUrl(imageUrl); }}
                      >
                        View Image
                      </button>
                    </div>
                  </div>
                  ) : null;
                })()}
                
                <div className="issue-header">
                  <div>
                    <h3 className="issue-title">{issue.title}</h3>
                    <div className="issue-location">
                      <MapPin size={12} style={{ display: 'inline', marginRight: '0.3rem' }} />
                      {issue.location?.name || 'Location not specified'}
                    </div>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: '#94a3b8',
                      marginTop: '0.3rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}>
                      <Calendar size={12} />
                      {formatDate(issue.createdAt || issue.timestamp)} • {getTimeSince(issue.createdAt || issue.timestamp)}
                    </div>
                  </div>
                  {getStatusBadge(issue.status)}
                </div>

                <div className="issue-description" style={{ marginBottom: '1rem' }}>
                  {issue.description}
                </div>

                {issue.status === 'resolved' && issue.resolved?.photo?.url && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#059669', marginBottom: '0.5rem', fontWeight: '600' }}>
                      ✓ Resolved with photo proof
                    </div>
                    <div style={{ height: 120, borderRadius: 8, overflow: 'hidden', background: '#f8fafc' }}>
                      <img 
                        src={issue.resolved.photo.url} 
                        alt="Resolution proof" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    </div>
                  </div>
                )}

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '1rem',
                  borderTop: '1px solid #f1f5f9'
                }}>
                  <div style={{ 
                    fontSize: '0.8rem', 
                    color: '#64748b',
                    background: '#f8fafc',
                    padding: '0.3rem 0.8rem',
                    borderRadius: '12px'
                  }}>
                    {issue.category}
                  </div>

                  <div className="issue-actions">
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.8rem',
                      color: '#64748b'
                    }}>
                      <ThumbsUp size={14} />
                      {issue.upvotedBy?.length || 0} upvotes
                    </div>
                  </div>
                </div>

                {/* Progress Timeline for In-Progress Items */}
                {issue.status === 'in-progress' && (
                  <div style={{ 
                    marginTop: '1rem',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <h4 style={{ 
                      fontSize: '0.9rem', 
                      fontWeight: '600', 
                      marginBottom: '0.8rem',
                      color: '#1e293b'
                    }}>
                      Progress Timeline
                    </h4>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: '1rem',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div style={{ 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          background: '#10b981' 
                        }} />
                        <span style={{ color: '#10b981' }}>Reported</span>
                      </div>
                      <div style={{ 
                        width: '20px', 
                        height: '2px', 
                        background: '#10b981' 
                      }} />
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div style={{ 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          background: '#3b82f6' 
                        }} />
                        <span style={{ color: '#3b82f6' }}>In Progress</span>
                      </div>
                      <div style={{ 
                        width: '20px', 
                        height: '2px', 
                        background: '#e5e7eb' 
                      }} />
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div style={{ 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          background: '#e5e7eb' 
                        }} />
                        <span style={{ color: '#9ca3af' }}>Resolved</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Resolution Confirmation for Resolved Items */}
                {issue.status === 'resolved' && (
                  <div style={{ 
                    marginTop: '1rem',
                    padding: '1rem',
                    background: '#f0fdf4',
                    borderRadius: '8px',
                    border: '1px solid #bbf7d0'
                  }}>
                    <h4 style={{ 
                      fontSize: '0.9rem', 
                      fontWeight: '600', 
                      marginBottom: '0.8rem',
                      color: '#15803d'
                    }}>
                      ✅ Issue Resolved!
                    </h4>
                    <p style={{ 
                      fontSize: '0.8rem', 
                      color: '#16a34a',
                      marginBottom: '1rem'
                    }}>
                      This issue has been marked as resolved. You can acknowledge and close it when you're satisfied.
                    </p>
                    <button 
                      className="btn-primary" 
                      style={{ 
                        fontSize: '0.8rem',
                        padding: '0.5rem 1rem'
                      }}
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
            ))}
          </div>
        )}
      </div>
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

export default MyReports;