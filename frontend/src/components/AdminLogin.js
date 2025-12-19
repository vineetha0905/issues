import React, { useState, useContext } from 'react';
import { toast } from 'sonner';
import apiService from '../services/api';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, User, Lock, Shield, Eye, EyeOff } from 'lucide-react';

const AdminLogin = ({ setUser, setIsAdmin }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const resp = await apiService.adminLogin(username, password);
      const data = resp.data || resp;
      if (!data?.token || !data?.user) {
        throw new Error('Invalid admin login response');
      }
      const adminUser = {
        id: data.user._id || data.user.id || 'admin',
        name: data.user.name || 'Admin User',
        username: data.user.username || username,
        role: data.user.role || 'admin'
      };
      // Persist admin session and token for auth headers
      localStorage.setItem('civicconnect_admin', JSON.stringify(adminUser));
      localStorage.setItem('civicconnect_token', data.token);
      setUser(adminUser);
      setIsAdmin(true);
      navigate('/admin');
      toast.success('Admin login successful');
    } catch (err) {
      toast.error(err.message || 'Admin login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <button 
          onClick={() => navigate('/')}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#1e4359', 
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="login-header">
          <div style={{ 
            width: '60px', 
            height: '60px', 
            background: 'linear-gradient(135deg, #1e4359 0%, #3f6177 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <Shield size={30} color="white" />
          </div>
          <h1 className="login-title">{t('adminLogin')}</h1>
          <p className="login-subtitle">Access admin dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label className="form-label">
              <User size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              Username
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <Lock size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: '45px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px'
                }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;