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
            // Check if result contains an error status (even if HTTP status is 200)
            if (result && result.status === 'error') {
              console.error('ML backend processing error:', result.reason || 'Unknown error');
              // If this is the last attempt, return null to skip ML validation
              if (attempt === retries) return null;
              continue; // Retry on next attempt
            }
            
            // Only reject if ML explicitly rejected the report
            if (result && result.status === 'rejected' && result.accept === false) {
              return result; // Return rejection so caller can handle it
            }
            // For 422 (validation errors), log the error details
            if (response.status === 422) {
              console.error('ML backend validation error:', result || responseText);
              // If this is the last attempt, return null
              if (attempt === retries) return null;
              continue; // Retry on next attempt
            }
            // For 5xx errors, retry if we have attempts left
            if (response.status >= 500 && response.status < 600 && attempt < retries) {
              console.warn(`ML backend returned ${response.status}, retrying...`);
              continue;
            }
            // For other errors, just return null (skip ML validation)
            console.warn('ML backend returned error, skipping validation:', result || responseText);
            return null;
          }
          
          // Check if result has error status even if HTTP status is 200
          if (result && result.status === 'error') {
            console.error('ML backend processing error:', result.reason || 'Unknown error');
            // If this is the last attempt, return null to skip ML validation
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

  async verifyOtpByAadhaar(aadhaarNumber, otp) {
    const response = await fetch(`${this.baseURL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadhaarNumber, otp })
    });
    return this.handleResponse(response);
  }

  async verifyOtp(mobile, otp) {
    const response = await fetch(`${this.baseURL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, otp })
    });
    return this.handleResponse(response);
  }

  async guestLogin(name) {
    const response = await fetch(`${this.baseURL}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return this.handleResponse(response);
  }

  async registerUser({ name, aadhaarNumber, mobile, address }) {
    const response = await fetch(`${this.baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, aadhaarNumber, mobile, address })
    });
    return this.handleResponse(response);
  }

  async adminLogin(username, password) {
    const response = await fetch(`${this.baseURL}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return this.handleResponse(response);
  }

  async employeeLogin({ employeeId, password, department }) {
    const response = await fetch(`${this.baseURL}/auth/employee-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, password, department })
    });
    return this.handleResponse(response);
  }

  // ================= ISSUES =================
  async getIssues(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(
      `${this.baseURL}/issues${queryString ? `?${queryString}` : ''}`,
      { headers: this.getAuthHeaders() }
    );
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

  async updateIssue(id, updateData) {
    const response = await fetch(`${this.baseURL}/issues/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updateData)
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

  async closeIssue(id) {
    const response = await fetch(`${this.baseURL}/issues/${id}/close`, {
      method: 'PUT',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async getLeaderboard() {
    const response = await fetch(`${this.baseURL}/issues/leaderboard`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async getUserIssues(userId) {
    const response = await fetch(`${this.baseURL}/issues/user/${userId}`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  // ================= EMPLOYEE =================
  async getEmployeeIssues(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(
      `${this.baseURL}/employee/issues${queryString ? `?${queryString}` : ''}`,
      { headers: this.getAuthHeaders() }
    );
    return this.handleResponse(response);
  }

  async acceptIssue(issueId) {
    const response = await fetch(`${this.baseURL}/employee/issues/${issueId}/accept`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async resolveIssue(issueId, { imageFile, latitude, longitude }) {
    // Prepare multipart/form-data
    const formData = new FormData();
    
    if (imageFile) {
      formData.append('image', imageFile);
    }
    
    if (latitude) {
      formData.append('latitude', latitude.toString());
    }
    
    if (longitude) {
      formData.append('longitude', longitude.toString());
    }

    // Get auth token for headers (but don't set Content-Type - browser will set it with boundary)
    const token = localStorage.getItem('civicconnect_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseURL}/employee/issues/${issueId}/resolve`, {
      method: 'PUT',
      headers: headers,
      body: formData
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

  async removeUpvote(id) {
    const response = await fetch(`${this.baseURL}/issues/${id}/upvote`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
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

  async assignIssue(issueId, body = {}) {
    const response = await fetch(`${this.baseURL}/admin/issues/${issueId}/assign`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body)
    });
    return this.handleResponse(response);
  }

  async updateIssueStatus(issueId, body) {
    const response = await fetch(`${this.baseURL}/admin/issues/${issueId}/status`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body)
    });
    return this.handleResponse(response);
  }

  // Employee Management
  async createEmployee(employeeData) {
    const response = await fetch(`${this.baseURL}/admin/employees`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(employeeData)
    });
    return this.handleResponse(response);
  }

  async getEmployees(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseURL}/admin/employees?${queryParams}`, {
      headers: this.getAuthHeaders()
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

  // ================= COMMENTS =================
  async getComments(issueId) {
    const response = await fetch(`${this.baseURL}/issues/${issueId}/comments`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }

  async addComment(issueId, commentData) {
    const response = await fetch(`${this.baseURL}/issues/${issueId}/comments`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(commentData)
    });
    return this.handleResponse(response);
  }

  // ================= PROFILE =================
  async getMyProfile() {
    const response = await fetch(`${this.baseURL}/auth/profile`, {
      headers: this.getAuthHeaders()
    });
    return this.handleResponse(response);
  }
}

export default new ApiService();
