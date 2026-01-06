from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import traceback
import os
import sys
import json
import base64

# Initialize app first - this must work
app = FastAPI(title="Civic ML Backend API", version="1.0.0")

# Try to import ML modules - make them optional so app can start even if they fail
classify_report = None
ml_available = False

try:
    from app.pipeline import classify_report
    from app.models import ReportRequest
    ml_available = True
    print("✅ ML modules loaded successfully")
except Exception as e:
    print(f"⚠️ ML modules not available (non-critical): {e}")
    print("⚠️ API will return default responses")
    # Import ReportRequest even if ML is not available for endpoint to work
    try:
        from app.models import ReportRequest
    except Exception:
        pass

# Log startup information
print("=" * 50)
print("ML Backend API Starting...")
print(f"Python version: {sys.version}")
print(f"Working directory: {os.getcwd()}")
print(f"ML Available: {ml_available}")
print("=" * 50)

# CORS configuration - SIMPLIFIED AND RELIABLE
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # CRITICAL: Must be False when using "*"
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["*"],  # Expose all headers
    max_age=3600,  # Cache preflight for 1 hour
)

print("=" * 50)
print("CORS Configuration:")
print("  allow_origins: ['*'] (all origins)")
print("  allow_credentials: False")
print("=" * 50)

@app.get("/")
def health():
    return {"status": "ML API running", "version": "1.0.0", "ml_available": ml_available}

@app.get("/health")
def health_check():
    """Health check endpoint for Render"""
    return {"status": "healthy", "service": "ML Backend", "ml_available": ml_available}

@app.options("/submit")
async def submit_options():
    """Handle CORS preflight requests"""
    return {"status": "ok"}

@app.post("/submit")
async def submit_report(request: ReportRequest):
    """
    Submit a report for ML validation and classification.
    
    Accepts JSON (application/json) with the following fields:
    - report_id (required, string): Unique identifier for the report
    - description (required, string): Description of the issue
    - user_id (optional, string): User identifier
    - latitude (optional, float): Latitude coordinate (-90 to 90)
    - longitude (optional, float): Longitude coordinate (-180 to 180)
    - image_base64 (optional, string): Image file as base64-encoded string (data URI or plain base64)
    
    Returns a JSON response with classification results.
    """
    try:
        
        print(f"Received ML validation request: report_id={request.report_id}, description_length={len(request.description or '')}")
        
        # Clean up string fields
        report_id = request.report_id.strip()
        description = request.description.strip()
        user_id = request.user_id.strip() if request.user_id else None
        
        # Process base64 image if provided
        image_bytes = None
        MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
        if request.image_base64:
            try:
                # Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
                image_data = request.image_base64.strip()
                if ',' in image_data:
                    image_data = image_data.split(',', 1)[1]
                
                # Decode base64 to bytes
                image_bytes = base64.b64decode(image_data, validate=True)
                
                # Validate image size
                if len(image_bytes) > MAX_IMAGE_SIZE:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Validation error: Image file too large. Maximum size is {MAX_IMAGE_SIZE / (1024*1024):.1f}MB, got {len(image_bytes) / (1024*1024):.1f}MB"
                    )
                if len(image_bytes) == 0:
                    raise HTTPException(
                        status_code=422,
                        detail="Validation error: Image data is empty"
                    )
                print(f"Received image: {len(image_bytes)} bytes (decoded from base64)")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=422,
                    detail=f"Validation error: Failed to decode base64 image: {str(e)}"
                )
        
        # Prepare report data
        report_data = {
            "report_id": report_id,
            "description": description,
            "user_id": user_id,
            "image_bytes": image_bytes,
            "latitude": request.latitude,
            "longitude": request.longitude
        }
        
        # Classify the report using ML
        print("Starting ML classification...")
        print(f"Report data keys: {list(report_data.keys())}")
        print(f"Has image_bytes: {bool(report_data.get('image_bytes'))}")
        if report_data.get('image_bytes'):
            print(f"Image bytes size: {len(report_data.get('image_bytes'))} bytes")
        
        try:
            result = classify_report(report_data)
            print(f"ML classification complete: status={result.get('status')}, category={result.get('category')}, confidence={result.get('confidence')}")
            
            # Ensure result has all required fields
            if not isinstance(result, dict):
                raise ValueError(f"classify_report returned non-dict: {type(result)}")
            
            # Ensure result has required keys
            if 'report_id' not in result:
                result['report_id'] = report_id
            if 'accept' not in result:
                result['accept'] = False
            if 'status' not in result:
                result['status'] = 'error'
            if 'category' not in result:
                result['category'] = 'Other'
            if 'confidence' not in result:
                result['confidence'] = 0.0
            
            return result
        except Exception as ml_error:
            print(f"ERROR in classify_report: {str(ml_error)}")
            print(traceback.format_exc())
            # Return error response with 200 status (not 500) so frontend can handle it
            return {
                "report_id": report_id,
                "accept": False,
                "status": "error",
                "category": "Other",
                "confidence": 0.0,
                "reason": f"ML classification error: {str(ml_error)}"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in submit_report: {str(e)}")
        print(traceback.format_exc())
        # Return error response with 200 status (not 500) so frontend can handle it
        error_report_id = report_id if 'report_id' in locals() else "unknown"
        return {
            "report_id": error_report_id,
            "accept": False,
            "status": "error",
            "category": "Other",
            "confidence": 0.0,
            "reason": f"ML processing error: {str(e)}"
        }
