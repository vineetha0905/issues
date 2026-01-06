const API_BASE_URL =
  process.env.REACT_APP_API_BASE || 'http://localhost:5001/api';

const ML_BASE_URL =
  process.env.REACT_APP_ML_BASE || 'http://localhost:8000';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.mlBaseURL = ML_BASE_URL;
  }

  // Helper method to get auth headers
  getAuthHeaders() {
    const token = localStorage.getItem('civicconnect_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  // Helper method to handle API responses
  async handleResponse(response) {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      // Include reason in error message if available
      const errorMessage = error.reason 
        ? `${error.message || 'Error'}: ${error.reason}`
        : (error.message || 'Something went wrong');
      throw new Error(errorMessage);
    }
    return response.json();
  }

  // ================= FILE UPLOADS =================
  async uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);

    const headers = {};
    const token = localStorage.getItem('civicconnect_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseURL}/upload/image`, {
      method: 'POST',
      headers,
      body: formData
    });
    return this.handleResponse(response);
  }

  // ================= ML VALIDATION =================
  // This method is now non-blocking - if ML backend is slow, it will timeout and return null
  // Increased timeout to 45 seconds to allow for Render cold starts
  async validateReportWithML(payload, imageFile = null, timeoutMs = 45000, retries = 2) {
    // Use a longer timeout (45 seconds) to allow for Render free tier cold starts
    // Retry logic with exponential backoff
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: wait 2^attempt seconds before retry
          const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          console.log(`ML validation retry attempt ${attempt}, waiting ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
          // Prepare multipart/form-data
          const formData = new FormData();
          formData.append('report_id', payload.report_id || `${Date.now()}`);
          formData.append('description', payload.description || '');
          if (payload.user_id) {
            formData.append('user_id', payload.user_id);
          }
          if (payload.latitude !== undefined && payload.latitude !== null) {
            formData.append('latitude', payload.latitude.toString());
          }
          if (payload.longitude !== undefined && payload.longitude !== null) {
            formData.append('longitude', payload.longitude.toString());
          }
          if (imageFile) {
            formData.append('image', imageFile);
          }

          const fetchPromise = fetch(`${this.mlBaseURL}/submit`, {
            method: 'POST',
            body: formData, // Don't set Content-Type header - browser will set it with boundary
            signal: controller.signal
          });
          
          // Race between fetch and timeout
          const response = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
            )
          ]);
          
          clearTimeout(timeoutId);
      
          // Read response as text first, then parse as JSON
          const responseText = await response.text();
          let result;
          
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            console.warn('ML backend returned non-JSON response:', responseText);
            // If this is the last attempt, return null
            if (attempt === retries) return null;
            continue; // Retry on next attempt
          }
          
          // If status is not ok, check if we should retry
          if (!response.ok) {
            console.warn(`ML backend returned status ${response.status}:`, result);
            // If this is the last attempt, return null (non-blocking)
            if (attempt === retries) return null;
            continue; // Retry on next attempt
          }
          
          // Success response (200) - return the result
          console.log('ML validation successful on attempt', attempt + 1);
          return result;
        } catch (fetchError) {
          clearTimeout(timeoutId);
      
          // For timeout or network errors, retry if we have attempts left
          if ((fetchError.name === 'AbortError' || fetchError.name === 'TimeoutError' || 
              fetchError.message === 'TIMEOUT' ||
              fetchError.message.includes('Failed to fetch') || 
              fetchError.message.includes('NetworkError')) && attempt < retries) {
            console.warn(`ML backend timeout/network error on attempt ${attempt + 1}, retrying...`);
            continue; // Retry on next attempt
          }
          
          // If this is the last attempt, return null
          if (attempt === retries) {
            console.warn('ML backend timeout or network error after all retries, skipping validation');
            return null;
          }
        }
      } catch (error) {
        // For CORS errors or other errors, don't retry
        if (error.message.includes('CORS')) {
          console.warn('ML backend CORS error, skipping validation');
          return null;
        }
        
        // If this is the last attempt, return null
        if (attempt === retries) {
          console.warn('ML backend error after all retries, skipping validation:', error.message);
          return null;
        }
        
        // Otherwise, continue to next retry
        continue;
      }
    }
    
    // If we get here, all retries failed
    console.warn('ML validation failed after all retries');
    return null;
  }

  // ================= AUTH =================
  async sendOtpByAadhaar(aadhaarNumber) {
    const response = await fetch(`${this.baseURL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadhaarNumber })
    });
    return this.handleResponse(response);
  }

  async sendOtpByMobile(mobile) {
    const response = await fetch(`${this.baseURL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile })
    });
    return this.handleResponse(response);
  }

  async sendOtpByEmail(email) {
    const response = await fetch(`${this.baseURL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return this.handleResponse(response);
  }

  async verifyOtp(mobile, email, otp) {
    const body = { otp };
    if (mobile) body.mobile = mobile;
    if (email) body.email = email;
    
    const response = await fetch(`${this.baseURL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return this.handleResponse(response);
  }

  async verifyOtpByAadhaar(aadhaarNumber, otp) {
    const response = await fetch(`${this.baseURL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadhaarNumber, otp })
    });
    return this.handleResponse(response);
  }

  async resendOtp(mobile, email) {
    const response = await fetch(`${this.baseURL}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, email })
    });
    return this.handleResponse(response);
  }

  async login(mobile, email, password) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, email, password })
    });
    return this.handleResponse(response);
  }

  async register(userData) {
    const response = await fetch(`${this.baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    return this.handleResponse(response);
  }

  async guestLogin() {
    const response = await fetch(`${this.baseURL}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return this.handleResponse(response);
  }

  async adminLogin(credentials) {
    const response = await fetch(`${this.baseURL}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return this.handleResponse(response);
  }

  async employeeLogin(credentials) {
    const response = await fetch(`${this.baseURL}/auth/employee-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return this.handleResponse(response);
  }

  async logout() {
    localStorage.removeItem('civicconnect_token');
    localStorage.removeItem('civicconnect_user');
  }

  // ================= ISSUES =================
  async getIssues(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseURL}/issues${queryString ? `?${queryString}` : ''}`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async getIssueById(id) {
    const response = await fetch(`${this.baseURL}/issues/${id}`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async createIssue(issueData) {
    const response = await fetch(`${this.baseURL}/issues`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(issueData)
    });
    return this.handleResponse(response);
  }

  async updateIssue(id, issueData) {
    const response = await fetch(`${this.baseURL}/issues/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(issueData)
    });
    return this.handleResponse(response);
  }

  async deleteIssue(id) {
    const response = await fetch(`${this.baseURL}/issues/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async upvoteIssue(id) {
    const response = await fetch(`${this.baseURL}/issues/${id}/upvote`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async getNearbyIssues(latitude, longitude, radius = 5000) {
    const response = await fetch(
      `${this.baseURL}/issues/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`,
      {
        headers: this.getAuthHeaders()
      }
    );
    return this.handleResponse(response);
  }

  async getUserIssues(userId) {
    return this.getIssues({ userId });
  }

  // ================= COMMENTS =================
  async getComments(issueId) {
    const response = await fetch(`${this.baseURL}/issues/${issueId}/comments`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async addComment(issueId, comment) {
    const response = await fetch(`${this.baseURL}/issues/${issueId}/comments`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ text: comment })
    });
    return this.handleResponse(response);
  }

  // ================= ADMIN =================
  async getAdminDashboard() {
    const response = await fetch(`${this.baseURL}/admin/dashboard`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async getAdminAnalytics() {
    const response = await fetch(`${this.baseURL}/admin/analytics`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async assignIssue(issueId, employeeId) {
    const response = await fetch(`${this.baseURL}/admin/issues/${issueId}/assign`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ employeeId })
    });
    return this.handleResponse(response);
  }

  async updateIssueStatus(issueId, status) {
    const response = await fetch(`${this.baseURL}/admin/issues/${issueId}/status`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    return this.handleResponse(response);
  }

  async getAllUsers() {
    const response = await fetch(`${this.baseURL}/admin/users`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async updateUserStatus(userId, status) {
    const response = await fetch(`${this.baseURL}/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    return this.handleResponse(response);
  }

  // ================= EMPLOYEE MANAGEMENT =================
  async getEmployees(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseURL}/admin/employees${queryString ? `?${queryString}` : ''}`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async createEmployee(employeeData) {
    const response = await fetch(`${this.baseURL}/admin/employees`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(employeeData)
    });
    return this.handleResponse(response);
  }

  async updateEmployee(employeeId, employeeData) {
    const response = await fetch(`${this.baseURL}/admin/employees/${employeeId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(employeeData)
    });
    return this.handleResponse(response);
  }

  async deleteEmployee(employeeId) {
    const response = await fetch(`${this.baseURL}/admin/employees/${employeeId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  // ================= EMPLOYEE =================
  async getEmployeeIssues(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseURL}/employee/issues${queryString ? `?${queryString}` : ''}`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async acceptIssue(issueId) {
    const response = await fetch(`${this.baseURL}/employee/issues/${issueId}/accept`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async resolveIssue(issueId, resolvedData) {
    const formData = new FormData();
    if (resolvedData.latitude !== undefined) {
      formData.append('latitude', resolvedData.latitude.toString());
    }
    if (resolvedData.longitude !== undefined) {
      formData.append('longitude', resolvedData.longitude.toString());
    }
    if (resolvedData.photo) {
      formData.append('photo', resolvedData.photo);
    }

    const headers = {};
    const token = localStorage.getItem('civicconnect_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseURL}/employee/issues/${issueId}/resolve`, {
      method: 'PUT',
      headers,
      body: formData
    });
    return this.handleResponse(response);
  }

  // ================= LEADERBOARD =================
  async getLeaderboard(limit = 100) {
    const queryString = new URLSearchParams({ limit }).toString();
    const response = await fetch(`${this.baseURL}/issues/leaderboard${queryString ? `?${queryString}` : ''}`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  // ================= NOTIFICATIONS =================
  async getNotifications() {
    const response = await fetch(`${this.baseURL}/notifications`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async markNotificationRead(notificationId) {
    const response = await fetch(`${this.baseURL}/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async markAllNotificationsRead() {
    const response = await fetch(`${this.baseURL}/notifications/read-all`, {
      method: 'PUT',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  // ================= PROFILE =================
  async updateProfile(profileData) {
    const response = await fetch(`${this.baseURL}/auth/profile`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(profileData)
    });
    return this.handleResponse(response);
  }

  async getMyProfile() {
    const response = await fetch(`${this.baseURL}/auth/profile`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

}

export default new ApiService();
