import React, { useState, useContext, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, IdCard, Key } from 'lucide-react';
import apiService from '../services/api';

const Login = ({ setUser, setIsAdmin }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    
    // Clean mobile number
    const cleanedMobile = mobile.replace(/\D/g, '').trim();
    
    if (!cleanedMobile || cleanedMobile.length !== 10) {
      toast.warning('Please enter a valid 10-digit mobile number');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.sendOtpByMobile(cleanedMobile);
      setIsOtpSent(true);
      setResendCooldown(10); // Start 60-second cooldown
      
      // In development mode, show the OTP
      if (response.data && response.data.otp) {
        toast.success(`OTP sent. Dev OTP: ${response.data.otp}`);
      } else {
        toast.success('OTP sent to your phone');
      }
    } catch (error) {
      // Extract detailed error message from validation errors if available
      let errorMessage = error.message;
      if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
        errorMessage = error.errors.map(err => err.msg || err.message).join(', ');
      }
      
      if (errorMessage.includes('Please register before proceeding') || errorMessage.includes('User not found')) {
        toast.error('This mobile number is not registered. Please register first before logging in.');
        // Optionally redirect to registration page
        // navigate('/register');
      } else {
        toast.error(`Error: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) {
      return; // Prevent resend during cooldown
    }

    setIsLoading(true);
    try {
      const response = await apiService.sendOtpByMobile(mobile);
      setResendCooldown(10); // Start 60-second cooldown
      setOtp(''); // Clear the previous OTP input
      
      // In development mode, show the OTP
      if (response.data && response.data.otp) {
        toast.success(`OTP resent. Dev OTP: ${response.data.otp}`);
      } else {
        toast.success('OTP resent to your phone');
      }
    } catch (error) {
      toast.error(`Error resending OTP: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Cooldown timer effect
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.warning('Please enter a valid 6-digit OTP');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.verifyOtp(mobile, null, otp);
      const user = {
        id: response.data.user._id,
        name: response.data.user.name,
        phone: response.data.user.mobile || null,
        isGuest: false,
        token: response.data.token
      };
      setUser(user);
      localStorage.setItem('civicconnect_user', JSON.stringify(user));
      localStorage.setItem('civicconnect_token', response.data.token);
      // Ensure admin session is cleared so citizen routes are accessible
      try { localStorage.removeItem('civicconnect_admin'); } catch (_) {}
      if (typeof setIsAdmin === 'function') {
        setIsAdmin(false);
      }
      navigate('/citizen');
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Guest login removed as requested

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#123244] via-[#1e4359] via-[#3f6177] to-[#d8c7bd] flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="bg-white/95 backdrop-blur-xl p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl w-full max-w-md shadow-xl border border-white/30">
        <button 
          onClick={() => navigate('/')}
          className="bg-none border-none text-[#1e4359] cursor-pointer mb-4 p-1 hover:opacity-70 transition-opacity"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            {t('login')}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 font-normal">
            Enter your mobile number to continue
          </p>
        </div>

        {!isOtpSent ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col gap-2">
              <label className="font-medium text-gray-800 text-sm sm:text-base flex items-center gap-2">
                <IdCard size={16} className="inline" />
                Mobile Number
              </label>
              <input
                type="tel"
                className="px-4 py-3 sm:py-3.5 border-2 border-gray-200 rounded-xl text-base sm:text-lg transition-all duration-300 focus:outline-none focus:border-[#1e4359] focus:ring-4 focus:ring-[#1e4359]/10 font-['Fredoka',sans-serif]"
                placeholder="Enter 10-digit mobile number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                maxLength={10}
                pattern="[0-9]{10}"
                required
              />
            </div>

            <button 
              type="submit" 
              className="bg-gradient-to-r from-[#1e4359] to-[#3f6177] text-white border-none px-4 py-3 sm:py-3.5 rounded-xl text-base sm:text-lg font-semibold cursor-pointer transition-all duration-300 hover:shadow-lg hover:transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-['Fredoka',sans-serif]"
              disabled={isLoading || mobile.length !== 10}
            >
              {isLoading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col gap-2">
              <label className="font-medium text-gray-800 text-sm sm:text-base flex items-center gap-2">
                <Key size={16} className="inline" />
                Enter OTP
              </label>
              <input
                type="text"
                className="px-4 py-3 sm:py-3.5 border-2 border-gray-200 rounded-xl text-base sm:text-lg transition-all duration-300 focus:outline-none focus:border-[#1e4359] focus:ring-4 focus:ring-[#1e4359]/10 font-['Fredoka',sans-serif]"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                required
              />
              <small className="text-gray-600 text-xs sm:text-sm">
                OTP sent to mobile ending with {mobile.slice(-4)}
              </small>
            </div>

            <div className="flex flex-col gap-2">
              <button 
                type="submit" 
                className="bg-gradient-to-r from-[#1e4359] to-[#3f6177] text-white border-none px-4 py-3 sm:py-3.5 rounded-xl text-base sm:text-lg font-semibold cursor-pointer transition-all duration-300 hover:shadow-lg hover:transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-['Fredoka',sans-serif]"
                disabled={isLoading || otp.length !== 6}
              >
                {isLoading ? 'Verifying...' : 'Verify & Login'}
              </button>
              
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || isLoading}
                className="text-[#1e4359] bg-transparent border-none px-4 py-2 rounded-xl text-sm sm:text-base font-medium cursor-pointer transition-all duration-300 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline font-['Fredoka',sans-serif]"
              >
                {resendCooldown > 0 
                  ? `Resend OTP in ${resendCooldown}s` 
                  : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 sm:mt-6 text-center text-sm sm:text-base">
          <span className="text-gray-600">Don't have an account? </span>
          <Link to="/register" className="text-[#1e4359] font-medium hover:underline">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;