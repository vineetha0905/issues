import React, { useState, useContext } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import apiService from '../services/api';

const Register = () => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);

  const [name, setName] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUseMyLocation = async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        // Try OpenStreetMap Nominatim reverse geocoding (no API key needed for light use)
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
        const data = await resp.json();
        const line = data.display_name || `${data.address?.road || ''} ${data.address?.city || data.address?.town || data.address?.village || ''}`.trim();
        setAddress(line);
      } catch (e) {
        setAddress(`Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`);
      }
    }, (err) => {
      toast.error('Unable to retrieve your location');
      console.error(err);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Trim and validate inputs
    const trimmedName = name.trim();
    const trimmedAadhaar = aadhaarNumber.replace(/\D/g, '').trim();
    const trimmedMobile = mobile.replace(/\D/g, '').trim();
    const trimmedAddress = address ? address.trim() : '';
    
    if (!trimmedName || trimmedName.length < 2) {
      toast.warning('Please enter a valid name (at least 2 characters)');
      return;
    }
    if (trimmedAadhaar.length !== 12) {
      toast.warning('Please enter a valid 12-digit Aadhaar number');
      return;
    }
    if (trimmedMobile.length !== 10) {
      toast.warning('Please enter a valid 10-digit mobile number');
      return;
    }
    if (trimmedAddress && trimmedAddress.length > 300) {
      toast.warning('Address cannot exceed 300 characters');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await apiService.registerUser({ 
        name: trimmedName, 
        aadhaarNumber: trimmedAadhaar, 
        mobile: trimmedMobile, 
        address: trimmedAddress || undefined 
      });
      toast.success('Registered successfully');
      // Optionally store token/user if returned
      if (result.data && result.data.token && result.data.user) {
        localStorage.setItem('civicconnect_user', JSON.stringify({
          id: result.data.user._id,
          name: result.data.user.name,
          phone: result.data.user.mobile || null,
          isGuest: false,
          token: result.data.token
        }));
        localStorage.setItem('civicconnect_token', result.data.token);
      }
      navigate('/login');
    } catch (error) {
      // Extract detailed error message from validation errors if available
      let errorMessage = error.message;
      if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
        errorMessage = error.errors.map(err => err.msg || err.message).join(', ');
      }
      toast.error(`Registration failed: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#123244] via-[#1e4359] via-[#3f6177] to-[#d8c7bd] flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="bg-white/95 backdrop-blur-xl p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl w-full max-w-md shadow-xl border border-white/30">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            {t('register')}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 font-normal">
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-col gap-2">
            <label className="font-medium text-gray-800 text-sm sm:text-base">
              Full Name
            </label>
            <input
              type="text"
              className="px-4 py-3 sm:py-3.5 border-2 border-gray-200 rounded-xl text-base sm:text-lg transition-all duration-300 focus:outline-none focus:border-[#1e4359] focus:ring-4 focus:ring-[#1e4359]/10 font-['Fredoka',sans-serif]"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-medium text-gray-800 text-sm sm:text-base">
              Aadhaar Number
            </label>
            <input
              type="tel"
              className="px-4 py-3 sm:py-3.5 border-2 border-gray-200 rounded-xl text-base sm:text-lg transition-all duration-300 focus:outline-none focus:border-[#1e4359] focus:ring-4 focus:ring-[#1e4359]/10 font-['Fredoka',sans-serif]"
              placeholder="12-digit Aadhaar"
              value={aadhaarNumber}
              onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ''))}
              maxLength={12}
              pattern="[0-9]{12}"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-medium text-gray-800 text-sm sm:text-base">
              Mobile Number
            </label>
            <input
              type="tel"
              className="px-4 py-3 sm:py-3.5 border-2 border-gray-200 rounded-xl text-base sm:text-lg transition-all duration-300 focus:outline-none focus:border-[#1e4359] focus:ring-4 focus:ring-[#1e4359]/10 font-['Fredoka',sans-serif]"
              placeholder="10-digit mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              maxLength={10}
              pattern="[0-9]{10}"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-medium text-gray-800 text-sm sm:text-base">
              Address
            </label>
            <textarea
              className="px-4 py-3 sm:py-3.5 border-2 border-gray-200 rounded-xl text-base sm:text-lg transition-all duration-300 focus:outline-none focus:border-[#1e4359] focus:ring-4 focus:ring-[#1e4359]/10 font-['Fredoka',sans-serif] resize-none"
              placeholder="Your address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
            />
            <button 
              type="button" 
              className="bg-transparent text-[#1e4359] border-2 border-[#1e4359] px-4 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-medium cursor-pointer transition-all duration-300 hover:bg-[#1e4359] hover:text-white font-['Fredoka',sans-serif]"
              onClick={handleUseMyLocation}
            >
              Use my location
            </button>
          </div>

          <button 
            type="submit" 
            className="bg-gradient-to-r from-[#1e4359] to-[#3f6177] text-white border-none px-4 py-3 sm:py-3.5 rounded-xl text-base sm:text-lg font-semibold cursor-pointer transition-all duration-300 hover:shadow-lg hover:transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-['Fredoka',sans-serif]"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Registering...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Register;


