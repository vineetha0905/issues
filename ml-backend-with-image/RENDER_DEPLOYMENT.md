# Deploying ML Backend to Render

This guide will help you deploy the Civic Connect ML Backend to Render.

## Prerequisites

1. A Render account (sign up at https://render.com)
2. Your ML backend code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Deployment Steps

### Option 1: Deploy using render.yaml (Recommended)

1. **Push your code to Git**
   ```bash
   git add .
   git commit -m "Prepare for Render deployment"
   git push origin main
   ```

2. **Create a new Web Service on Render**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Render will automatically detect `render.yaml` and use it

3. **Verify Configuration**
   - Service name: `civic-connect-ml`
   - Environment: `Python 3`
   - Build Command: `pip install --upgrade pip && pip install python-multipart && pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --timeout-keep-alive 75 --access-log --log-level info`

4. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy your service
   - Wait for deployment to complete (first deployment may take 5-10 minutes)

### Option 2: Manual Configuration

If you prefer to configure manually:

1. **Create a new Web Service**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your Git repository

2. **Configure Settings**
   - **Name**: `civic-connect-ml` (or your preferred name)
   - **Environment**: `Python 3`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: `ml-backend-with-image` (if your ML backend is in a subdirectory)
   - **Build Command**: 
     ```bash
     pip install --upgrade pip && pip install python-multipart && pip install -r requirements.txt
     ```
   - **Start Command**:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --timeout-keep-alive 75 --access-log --log-level info
     ```

3. **Environment Variables** (Optional)
   - `PORT`: Automatically set by Render (don't override)
   - `PYTHONUNBUFFERED`: `1` (for better logging)
   - `PYTHONDONTWRITEBYTECODE`: `1` (to avoid .pyc files)

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete

## Post-Deployment

### 1. Get Your Service URL

After deployment, Render will provide a URL like:
```
https://civic-connect-ml.onrender.com
```

### 2. Test the Health Endpoint

```bash
curl https://your-service-url.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ML Backend",
  "ml_available": true
}
```

### 3. Update Your Main Backend

Update your main backend's `.env` file or environment variables:

```env
ML_API_URL=https://your-service-url.onrender.com/submit
```

Or if using the root endpoint:
```env
ML_API_URL=https://your-service-url.onrender.com
```

### 4. Test the ML Endpoint

```bash
curl -X POST https://your-service-url.onrender.com/submit \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": "test-123",
    "description": "Test report",
    "latitude": 16.0716,
    "longitude": 77.9053
  }'
```

## Important Notes

### Cold Starts
- Render free tier services spin down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds (cold start)
- Consider upgrading to paid tier for always-on service

### Timeout Settings
- The service is configured with `--timeout-keep-alive 75` to handle Render's load balancer
- This prevents connection timeouts during cold starts

### Model Loading
- CLIP model (if used) will download on first request
- This may add 30-60 seconds to the first request
- Subsequent requests will be faster

### Resource Limits (Free Tier)
- 512 MB RAM
- 0.1 CPU
- 15-minute spin-down after inactivity
- 100 GB bandwidth/month

### Upgrading to Paid Tier
For production use, consider upgrading:
- Always-on service (no spin-down)
- More RAM and CPU
- Better performance
- Custom domains

## Troubleshooting

### Deployment Fails

1. **Check Build Logs**
   - Go to your service → "Logs" tab
   - Look for error messages during build

2. **Common Issues**
   - Missing dependencies: Check `requirements.txt`
   - Python version mismatch: Ensure Python 3.9+ is used
   - Port binding: Ensure using `$PORT` environment variable

### Service Won't Start

1. **Check Runtime Logs**
   - Go to your service → "Logs" tab
   - Look for startup errors

2. **Common Issues**
   - Import errors: Check all dependencies are installed
   - Port issues: Ensure using `0.0.0.0` as host and `$PORT` for port
   - CORS errors: Already configured to allow all origins

### Health Check Fails

1. **Verify Endpoint**
   ```bash
   curl https://your-service-url.onrender.com/health
   ```

2. **Check Service Status**
   - Go to Render dashboard
   - Check if service shows "Live" status

### ML Not Available

If `ml_available: false` in health check:
- Check logs for import errors
- Verify all ML dependencies are in `requirements.txt`
- Check if transformers/torch models can download

## Monitoring

### View Logs
- Go to your service → "Logs" tab
- Real-time logs are available
- Historical logs are kept for 7 days (free tier)

### Metrics
- Render provides basic metrics:
  - Request count
  - Response times
  - Error rates
- View in "Metrics" tab

## Updating Your Deployment

1. **Make Changes**
   - Edit your code locally
   - Test locally first

2. **Push to Git**
   ```bash
   git add .
   git commit -m "Update ML backend"
   git push origin main
   ```

3. **Auto-Deploy**
   - Render automatically detects changes
   - Triggers new deployment
   - Usually takes 2-5 minutes

## Security Considerations

1. **CORS Configuration**
   - Currently set to allow all origins (`*`)
   - For production, consider restricting to your frontend domain:
     ```python
     allow_origins=["https://your-frontend-domain.com"]
     ```

2. **Rate Limiting**
   - Consider adding rate limiting for production
   - Render provides some protection, but additional layers help

3. **API Keys** (if needed)
   - Use Render's environment variables for secrets
   - Never commit secrets to Git

## Support

- Render Documentation: https://render.com/docs
- Render Community: https://community.render.com
- Check service logs for detailed error messages

