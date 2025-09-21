import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { Camera, FileText, MapPin, Home, Bell, User, LogOut } from 'lucide-react';
import IssueMap from './IssueMap';

const CitizenDashboard = ({ user }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);

  const handleLogout = () => {
    localStorage.removeItem('civicconnect_user');
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div>
            <h1 className="dashboard-greeting">{t('hello')}</h1>
            <p className="dashboard-subtitle">Welcome back, {user.name}!</p>
          </div>
          <button 
            onClick={handleLogout}
            style={{ 
              background: 'rgba(255,255,255,0.2)', 
              border: 'none', 
              color: 'white', 
              padding: '0.5rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="dashboard-actions">
        <div className="actions-grid">
          <div className="action-card" onClick={() => navigate('/report-issue')}>
            <div className="action-icon">
              <Camera size={24} />
            </div>
            <div className="action-content">
              <h3>{t('reportIssue')}</h3>
              <p>Report a new civic issue in your area</p>
            </div>
          </div>

          <div className="action-card" onClick={() => navigate('/my-reports')}>
            <div className="action-icon">
              <FileText size={24} />
            </div>
            <div className="action-content">
              <h3>{t('myReports')}</h3>
              <p>Track your reported issues</p>
            </div>
          </div>

          <div className="action-card" onClick={() => navigate('/nearby-issues')}>
            <div className="action-icon">
              <MapPin size={24} />
            </div>
            <div className="action-content">
              <h3>{t('nearbyIssues')}</h3>
              <p>View and support community issues</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '1rem' }}>
        <h3 style={{ 
          fontSize: '1.2rem', 
          fontWeight: '600', 
          color: '#1e293b', 
          marginBottom: '1rem' 
        }}>
          Issues Near You
        </h3>
        <IssueMap />
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <div className="nav-item active">
          <Home size={20} />
          <span>Home</span>
        </div>
        <div className="nav-item" onClick={() => navigate('/nearby-issues')}>
          <MapPin size={20} />
          <span>Map</span>
        </div>
        <div className="nav-item">
          <Bell size={20} />
          <span>Notifications</span>
        </div>
        <div className="nav-item">
          <User size={20} />
          <span>Profile</span>
        </div>
      </div>
    </div>
  );
};

export default CitizenDashboard;