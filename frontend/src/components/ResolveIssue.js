import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import apiService from '../services/api';
import { MapPin, Upload, CheckCircle, ArrowLeft, Camera } from 'lucide-react';

const ResolveIssue = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [issue, setIssue] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await apiService.getIssueById(id);
        setIssue((resp.data || resp).issue || resp.data || resp);
      } catch (e) {
        navigate('/employee');
      }
    };
    load();
  }, [id, navigate]);

  const openMaps = () => {
    if (!issue?.location?.coordinates) return;
    const { latitude: lat, longitude: lng } = issue.location.coordinates;
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          setLatitude(lat.toString());
          setLongitude(lng.toString());
          toast.success('Location captured successfully');
        },
        (error) => {
          console.error('Error getting location:', error);
          toast.error('Failed to get location. Please enter manually.');
        }
      );
    } else {
      toast.error('Geolocation not supported. Please enter coordinates manually.');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    const fileInput = document.getElementById('resolveFileInput');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiService.resolveIssue(id, { imageFile, latitude, longitude });
      navigate('/employee');
    } catch (e) {
      toast.error(e.message || 'Failed to resolve issue');
      setSubmitting(false);
    }
  };

  if (!issue) return null;

  const photoUrl = issue.images?.[0]?.url;

  return (
    <div className="form-container">
      <div className="form-card">
        <div className="flex items-center mb-8">
          <button 
            onClick={() => navigate('/employee')}
            className="bg-transparent border-none text-[#1e4359] cursor-pointer mr-4"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="form-title">Resolve Issue</h1>
        </div>

        <p className="text-sm text-slate-500 mb-8 -mt-6 ml-9">Upload proof and confirm location</p>

        {photoUrl && (
          <div className="mb-8">
            <h3 className="text-sm text-slate-500 mb-2 font-semibold">Original Issue Photo</h3>
            <div className="h-48 rounded-xl overflow-hidden bg-slate-50">
              <img src={photoUrl} alt="issue" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        <div className="mb-8 p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-[#1e4359]" />
            <span className="font-semibold text-slate-700">Issue Location</span>
          </div>
          <div className="text-sm text-slate-500 mb-2">
            {issue.location?.name}
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Lat: {issue.location?.coordinates?.latitude?.toFixed(6)}</span>
            <span className="text-slate-300">•</span>
            <span>Lng: {issue.location?.coordinates?.longitude?.toFixed(6)}</span>
          </div>
          <button className="btn-secondary mt-2 text-xs px-3 py-1.5" onClick={openMaps}>
            Open in Maps
          </button>
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Upload Resolved Photo (Optional)</label>
            <div 
              className={`image-upload ${imageFile ? 'has-image' : ''}`}
              onClick={() => document.getElementById('resolveFileInput').click()}
            >
              <input
                id="resolveFileInput"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              {imageFile ? (
                <div className="relative">
                  <img 
                    src={URL.createObjectURL(imageFile)} 
                    alt="Preview"
                    className="uploaded-image"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="upload-text">Click to change image</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage();
                      }}
                      className="bg-red-600 text-white border-none rounded px-2 py-1 text-xs cursor-pointer"
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
          </div>

          <div className="form-group">
            <label className="form-label">Resolved Location (Required - within 10m of original)</label>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <input
                  type="number"
                  className="form-input"
                  placeholder="Latitude"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  step="any"
                  required
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <input
                  type="number"
                  className="form-input"
                  placeholder="Longitude"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  step="any"
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                className="btn-secondary px-4 py-3 min-w-[80px] flex items-center gap-2 text-sm"
              >
                <MapPin size={16} />
                GPS
              </button>
            </div>
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            <CheckCircle size={16} className="mr-2" /> 
            {submitting ? 'Submitting...' : 'Mark as Resolved'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResolveIssue;
