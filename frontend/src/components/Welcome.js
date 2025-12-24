import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { MapPin, Camera, Users, AlertTriangle } from 'lucide-react';

const Welcome = () => {
  const navigate = useNavigate();
  const { currentLanguage, setCurrentLanguage, t } = useContext(LanguageContext);

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'hi', name: 'हिंदी', flag: '🇮🇳' },
    { code: 'sat', name: 'ᱥᱟᱱᱛᱟᱲᱤ', flag: '🏛️' },
    { code: 'nag', name: 'नागपुरी', flag: '🏞️' }
  ];

  const handleGetStarted = () => {
    navigate('/login');
  };

  return (
    <div className="welcome-container">
      <div className="welcome-header">
        <h1 className="welcome-title">{t('welcome')}</h1>
        <p className="welcome-subtitle">Report and track civic issues in your community</p>
      </div>

      <img src='./images/logo.png' style={{width:'300px',height:'300px'}}/>

      <div className="language-section">
        <h2 className="language-title">{t('selectLanguage')}</h2>
        <div className="language-grid">
          {languages.map((lang) => (
            <div
              key={lang.code}
              className={`language-option ${currentLanguage === lang.code ? 'selected' : ''}`}
              onClick={() => setCurrentLanguage(lang.code)}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{lang.flag}</div>
              <div style={{ fontWeight: '500' }}>{lang.name}</div>
            </div>
          ))}
        </div>
      </div>

    

      <div style={{ marginTop: '2rem', textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button 
          className="btn-secondary" 
          onClick={() => navigate('/employee-login')}
          style={{ 
            background: 'rgba(30,255,0,0.2)', 
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'white'
          }}
        >
          Employee Login
        </button>
        <button 
          className="btn-secondary" 
          onClick={() => navigate('/admin-login')}
          style={{ 
            background: 'rgba(30,255,0,0.2)', 
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'white'
          }}
        >
          {t('adminLogin')}
        </button>
      </div>
      <button className="get-started-btn" onClick={handleGetStarted}>
        Citizen Login
      </button>
    </div>
  );
};

export default Welcome;