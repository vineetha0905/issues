import React, { useState, useContext, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, Camera, Mic, Type, MapPin, Upload } from 'lucide-react';
import apiService from '../services/api';

const ReportIssue = ({ user }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [reportData, setReportData] = useState({
    title: '',
    description: '',
    location: '',
    coordinates: null
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [recordingType, setRecordingType] = useState('text'); // 'photo', 'text'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const targetRef = useRef('description');
  const lastTranscriptTitleRef = useRef('');
  const lastTranscriptDescRef = useRef('');

  const ensureSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Try Chrome.');
      return null;
    }
    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false; // only final results to avoid repetition
      recognition.continuous = true;
      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        transcript = transcript.trim();
        if (!transcript) return;
        if (targetRef.current === 'title') {
          if (transcript === lastTranscriptTitleRef.current) return;
          lastTranscriptTitleRef.current = transcript;
          setReportData(prev => ({
            ...prev,
            title: (prev.title ? (prev.title.trim() + ' ') : '') + transcript
          }));
        } else {
          if (transcript === lastTranscriptDescRef.current) return;
          lastTranscriptDescRef.current = transcript;
          setReportData(prev => ({
            ...prev,
            description: (prev.description ? (prev.description.trim() + ' ') : '') + transcript
          }));
        }
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.onerror = () => {
        setIsListening(false);
      };
      recognitionRef.current = recognition;
    }
    return recognitionRef.current;
  };

  const toggleListening = () => {
    const recognition = ensureSpeechRecognition();
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      if (targetRef.current === 'title') {
        lastTranscriptTitleRef.current = '';
      } else {
        lastTranscriptDescRef.current = '';
      }
      recognition.start();
      setIsListening(true);
    }
  };


  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      // For demonstration, we'll just store the file name
      // In a real app, you'd upload this to a server
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    // Reset the file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      setReportData(prev => ({
        ...prev,
        coordinates: [23.2599, 77.4126],
        location: 'MG Road, Bhopal (Default Location)'
      }));
      return;
    }
    
    toast.info('Requesting your location...');
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setReportData(prev => ({
          ...prev,
          coordinates: [latitude, longitude],
          location: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`
        }));
        toast.success('Location obtained successfully');
        navigator.geolocation.clearWatch(watchId);
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMsg = 'Unable to get your location';
        if (error.code === 1) {
          errorMsg = 'Location permission denied. Please allow location access.';
        } else if (error.code === 2) {
          errorMsg = 'Location unavailable. Please check your device settings.';
        } else if (error.code === 3) {
          errorMsg = 'Location request timed out. Please try again.';
        }
        toast.error(errorMsg);
        
        // Fallback: try with less strict options
        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              setReportData(prev => ({
                ...prev,
                coordinates: [latitude, longitude],
                location: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`
              }));
              toast.success('Location obtained successfully');
            },
            () => {
              // Final fallback
              setReportData(prev => ({
                ...prev,
                coordinates: [23.2599, 77.4126],
                location: 'MG Road, Bhopal (Default Location)'
              }));
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
          );
        }, 1000);
        navigator.geolocation.clearWatch(watchId);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 }
    );
    
    // Clear watch after 20 seconds
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
    }, 20000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    let issueData = null; // Declare issueData in the outer scope

    try {
      let imageUrl = null;
      
      // Upload image if selected
      if (selectedFile) {
        const uploadResponse = await apiService.uploadImage(selectedFile);
        // Support both our backend shape { success, data: { url, publicId } }
        // and any direct shape { url, secure_url, public_id }
        const uploaded = uploadResponse?.data || uploadResponse || {};
        imageUrl = uploaded.url || uploaded.secure_url || null;
        var uploadedPublicId = uploaded.publicId || uploaded.public_id || null;
      }

      // Validate required fields
      if (!reportData.coordinates || !reportData.coordinates[0] || !reportData.coordinates[1]) {
        toast.error('Please get your location first');
        setIsSubmitting(false);
        return;
      }

      // Validate field lengths
      if (reportData.title.length < 5) {
        toast.warning('Title must be at least 5 characters long');
        setIsSubmitting(false);
        return;
      }

      if (reportData.description.length < 10) {
        toast.warning('Description must be at least 10 characters long');
        setIsSubmitting(false);
        return;
      }

      // Prepare issue data (category will be auto-detected by ML backend)
      issueData = {
        title: reportData.title,
        description: reportData.description,
        location: {
          name: reportData.location,
          coordinates: {
            latitude: reportData.coordinates[0],
            longitude: reportData.coordinates[1]
          }
        },
        images: imageUrl ? [{
          url: imageUrl,
          publicId: uploadedPublicId || imageUrl.split('/').pop(),
          caption: 'Issue image'
        }] : []
      };

      // Debug: Log the data being sent
      console.log('Sending issue data:', issueData);
      console.log('Location object:', issueData.location);
      console.log('Coordinates:', issueData.location.coordinates);
      console.log('User data:', user);
      
      // 1) Validate with ML backend first (category will be auto-detected)
      const mlPayload = {
        report_id: `${Date.now()}`,
        description: reportData.description,
        user_id: user?._id || user?.id || 'anon',
        image_url: imageUrl || null,
        latitude: reportData.coordinates[0],
        longitude: reportData.coordinates[1]
      };

      let mlResult;
      try {
        // ML validation with extended timeout (90 seconds)
        mlResult = await apiService.validateReportWithML(mlPayload);
        console.log('ML validation result:', mlResult);
        
        // Check if ML backend rejected the report
        if (mlResult && (mlResult.accept === false || mlResult.status === 'rejected')) {
          setIsSubmitting(false);
          const reason = mlResult.reason || 'Report rejected by validator';
          toast.error(`Report rejected: ${reason}`);
          return;
        }
        
        // If accept is false or status is not 'accepted', also reject
        if (mlResult && (mlResult.accept === false || (mlResult.status && mlResult.status !== 'accepted'))) {
          setIsSubmitting(false);
          const reason = mlResult.reason || 'Report rejected by validator';
          toast.error(`Report rejected: ${reason}`);
          return;
        }
        
        // Use ML-detected category if available
        if (mlResult && mlResult.category) {
          issueData.category = mlResult.category;
        }
      } catch (mlError) {
        console.error('ML validation error:', mlError);
        // ML service failed - allow report to proceed with default category
        // This ensures users can still submit reports even if ML backend is slow/down
        console.warn('ML validation failed, proceeding with default category:', mlError.message);
        
        // Use default category if ML fails
        if (!issueData.category) {
          issueData.category = 'Other';
        }
        
        // Show a warning toast but don't block submission
        toast.warning('Category detection unavailable. Using default category. Report will still be submitted.');
      }

      // 2) Submit to backend only if accepted
      // Optionally map ML priority to backend priority if provided
      if (mlResult.priority) {
        issueData.priority = mlResult.priority === 'urgent' ? 'urgent' : 'medium';
      }

      const response = await apiService.createIssue(issueData);
      
      setIsSubmitting(false);
      toast.success('Issue reported successfully!');
      navigate('/citizen');
    } catch (error) {
      setIsSubmitting(false);
      console.error('Issue creation error:', error);
      console.error('Issue data sent:', issueData);
      toast.error(`Error: ${error.message}`);
    }
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
              color: '#1e4359', 
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
            gridTemplateColumns: 'repeat(1, 1fr)', 
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
                background: recordingType === 'photo' ? '#1e4359' : 'transparent',
                color: recordingType === 'photo' ? 'white' : '#1e4359'
              }}
            >
              <Camera size={20} />
              <span>Photo</span>
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
                <div style={{ position: 'relative' }}>
                  <img 
                    src={URL.createObjectURL(selectedFile)} 
                    alt="Preview"
                    className="uploaded-image"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <p className="upload-text">Click to change image</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage();
                      }}
                      style={{
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <Camera className="upload-icon" />
                  <p className="upload-text">Click to take photo or upload image</p>
                </div>
              )}
            </div>
          )}

          {/* Voice panel removed as requested; mic remains near Description */}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Issue Title</label>
            <div className="form-row-inline" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Brief title for the issue"
                value={reportData.title}
                onChange={(e) => setReportData(prev => ({...prev, title: e.target.value}))}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  targetRef.current = 'title';
                  toggleListening();
                }}
                title="Dictate title with your voice"
                style={{ minWidth: '120px' }}
              >
                {isListening && targetRef.current === 'title' ? 'Stop' : 'Speak'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <div className="form-row-inline" style={{ display: 'flex', gap: '0.5rem', alignItems: 'start' }}>
              <textarea
                className="form-input"
                rows="4"
                placeholder="Describe the issue in detail or use the mic to dictate"
                value={reportData.description}
                onChange={(e) => setReportData(prev => ({...prev, description: e.target.value}))}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { targetRef.current = 'description'; toggleListening(); }}
                title="Dictate with your voice"
                style={{ minWidth: '120px' }}
              >
                {isListening ? 'Stop' : 'Speak'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Location</label>
            <div className="form-row-inline" style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
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