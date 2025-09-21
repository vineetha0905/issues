import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, Camera, Mic, Type, MapPin, Upload } from 'lucide-react';

const ReportIssue = ({ user }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [reportData, setReportData] = useState({
    title: '',
    description: '',
    category: '',
    location: '',
    coordinates: null
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [recordingType, setRecordingType] = useState('text'); // 'photo', 'voice', 'text'
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = [
    'Road & Traffic',
    'Water & Drainage',
    'Electricity',
    'Garbage & Sanitation',
    'Street Lighting',
    'Public Safety',
    'Parks & Recreation',
    'Other'
  ];

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      // For demonstration, we'll just store the file name
      // In a real app, you'd upload this to a server
    }
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setReportData(prev => ({
            ...prev,
            coordinates: [latitude, longitude],
            location: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`
          }));
        },
        (error) => {
          console.error('Error getting location:', error);
          // Mock location for demo
          setReportData(prev => ({
            ...prev,
            coordinates: [23.2599, 77.4126],
            location: 'MG Road, Bhopal (Mock Location)'
          }));
        }
      );
    } else {
      // Mock location for demo
      setReportData(prev => ({
        ...prev,
        coordinates: [23.2599, 77.4126],
        location: 'MG Road, Bhopal (Mock Location)'
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Mock submission
    setTimeout(() => {
      const newIssue = {
        id: Date.now().toString(),
        ...reportData,
        userId: user.id,
        status: 'reported',
        timestamp: new Date().toISOString(),
        upvotes: 0,
        image: selectedFile ? URL.createObjectURL(selectedFile) : null
      };

      // Save to localStorage for demo
      const existingIssues = JSON.parse(localStorage.getItem('user_issues') || '[]');
      existingIssues.push(newIssue);
      localStorage.setItem('user_issues', JSON.stringify(existingIssues));

      setIsSubmitting(false);
      alert('Issue reported successfully!');
      navigate('/citizen');
    }, 2000);
  };

  return (
    <div className="form-container">
      <div className="form-card">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <button 
            onClick={() => navigate('/citizen')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#667eea', 
              cursor: 'pointer',
              marginRight: '1rem'
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="form-title">{t('reportIssue')}</h1>
        </div>

        {/* Evidence Capture Section */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            fontSize: '1.1rem', 
            fontWeight: '600', 
            color: '#1e293b', 
            marginBottom: '1rem' 
          }}>
            Capture Evidence
          </h3>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <button
              type="button"
              className={`btn-secondary ${recordingType === 'photo' ? 'selected' : ''}`}
              onClick={() => setRecordingType('photo')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '1rem',
                background: recordingType === 'photo' ? '#667eea' : 'transparent',
                color: recordingType === 'photo' ? 'white' : '#667eea'
              }}
            >
              <Camera size={20} />
              <span>Photo</span>
            </button>

            <button
              type="button"
              className={`btn-secondary ${recordingType === 'voice' ? 'selected' : ''}`}
              onClick={() => setRecordingType('voice')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '1rem',
                background: recordingType === 'voice' ? '#667eea' : 'transparent',
                color: recordingType === 'voice' ? 'white' : '#667eea'
              }}
            >
              <Mic size={20} />
              <span>Voice</span>
            </button>

            <button
              type="button"
              className={`btn-secondary ${recordingType === 'text' ? 'selected' : ''}`}
              onClick={() => setRecordingType('text')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '1rem',
                background: recordingType === 'text' ? '#667eea' : 'transparent',
                color: recordingType === 'text' ? 'white' : '#667eea'
              }}
            >
              <Type size={20} />
              <span>Text</span>
            </button>
          </div>

          {/* File Upload for Photo */}
          {recordingType === 'photo' && (
            <div 
              className={`image-upload ${selectedFile ? 'has-image' : ''}`}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <input
                id="fileInput"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              
              {selectedFile ? (
                <div>
                  <img 
                    src={URL.createObjectURL(selectedFile)} 
                    alt="Preview"
                    className="uploaded-image"
                  />
                  <p className="upload-text">Click to change image</p>
                </div>
              ) : (
                <div>
                  <Camera className="upload-icon" />
                  <p className="upload-text">Click to take photo or upload image</p>
                </div>
              )}
            </div>
          )}

          {/* Voice Recording for Voice */}
          {recordingType === 'voice' && (
            <div className="image-upload">
              <Mic className="upload-icon" />
              <p className="upload-text">Voice recording functionality (Mock)</p>
              <button 
                type="button" 
                className="btn-secondary"
                style={{ marginTop: '1rem' }}
              >
                Start Recording
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Issue Title</label>
            <input
              type="text"
              className="form-input"
              placeholder="Brief title for the issue"
              value={reportData.title}
              onChange={(e) => setReportData(prev => ({...prev, title: e.target.value}))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-input"
              value={reportData.category}
              onChange={(e) => setReportData(prev => ({...prev, category: e.target.value}))}
              required
            >
              <option value="">Select a category</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              rows="4"
              placeholder="Describe the issue in detail"
              value={reportData.description}
              onChange={(e) => setReportData(prev => ({...prev, description: e.target.value}))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Location</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Enter location or use GPS"
                value={reportData.location}
                onChange={(e) => setReportData(prev => ({...prev, location: e.target.value}))}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={handleGetLocation}
                className="btn-secondary"
                style={{ 
                  padding: '1rem',
                  minWidth: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <MapPin size={16} />
                GPS
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReportIssue;