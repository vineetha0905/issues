#!/bin/bash
# Startup script for Render deployment
# Render sets PORT environment variable automatically

set -e  # Exit on error

PORT=${PORT:-7860}
echo "=========================================="
echo "Starting ML Backend on port $PORT"
echo "CORS_ORIGINS: ${CORS_ORIGINS:-not set}"
echo "Working directory: $(pwd)"
echo "Python: $(python --version)"
echo "=========================================="

# Use uvicorn to start the FastAPI app with proper settings for Render
# --timeout-keep-alive 75: Keep connections alive for Render's load balancer
# --workers 1: Single worker for free tier
# --access-log: Enable access logging for debugging
# --log-level info: Better logging
exec uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --timeout-keep-alive 75 --access-log --log-level info

