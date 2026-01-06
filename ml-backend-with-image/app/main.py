from fastapi import FastAPI, HTTPException, Request, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import traceback
import os
import sys
import json

# Initialize app first - this must work
app = FastAPI(title="Civic ML Backend API", version="1.0.0")

# Try to import ML modules - make them optional so app can start even if they fail
classify_report = None
ml_available = False

try:
    from app.pipeline import classify_report, initialize_models
    ml_available = True
    print("[OK] ML modules loaded successfully")
    # Initialize ML models (CLIP, etc.) on startup
    print("Initializing ML models...")
    try:
        initialize_models()
        print("[OK] ML models initialized successfully")
    except Exception as init_error:
        print(f"[WARN] ML model initialization failed (will use fallback): {init_error}")
        ml_available = False
except Exception as e:
    print(f"[WARN] ML modules not available (non-critical): {e}")
    print("[WARN] API will return default responses")

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
async def submit_report(
    report_id: str = Form(..., description="Unique identifier for the report"),
    description: str = Form(..., description="Description of the issue"),
    user_id: Optional[str] = Form(None, description="Optional user identifier"),
    latitude: Optional[str] = Form(None, description="Optional latitude as string (e.g., '37.7749')"),
    longitude: Optional[str] = Form(None, description="Optional longitude as string (e.g., '-122.4194')"),
    image: Optional[UploadFile] = File(None, description="Optional image file (JPEG, PNG, etc.)")
):
    """
    Submit a report for ML validation and classification.
    
    Accepts multipart/form-data with the following fields:
    - report_id (required, string): Unique identifier for the report
    - description (required, string): Description of the issue
    - user_id (optional, string): User identifier
    - latitude (optional, string): Latitude coordinate (-90 to 90), will be converted to float
    - longitude (optional, string): Longitude coordinate (-180 to 180), will be converted to float
    - image (optional, file): Image file (JPEG, PNG, etc.)
    
    Returns a JSON response with classification results.
    """
    try:
        print(f"Received ML validation request: report_id={report_id}, description_length={len(description or '')}")
        
        # Validate required fields with clear error messages
        if not report_id or not report_id.strip():
            raise HTTPException(
                status_code=422,
                detail="Validation error: 'report_id' is required and cannot be empty"
            )
        if not description or not description.strip():
            raise HTTPException(
                status_code=422,
                detail="Validation error: 'description' is required and cannot be empty"
            )
        
        # Clean up string fields
        report_id = report_id.strip()
        description = description.strip()
        user_id = user_id.strip() if user_id else None
        
        # Validate and convert latitude
        latitude_float = None
        if latitude:
            try:
                latitude_float = float(latitude.strip())
                if not (-90 <= latitude_float <= 90):
                    raise HTTPException(
                        status_code=422,
                        detail=f"Validation error: 'latitude' must be between -90 and 90, got {latitude_float}"
                    )
            except HTTPException:
                raise  # Re-raise HTTPException as-is
            except (ValueError, TypeError) as e:
                raise HTTPException(
                    status_code=422,
                    detail=f"Validation error: 'latitude' must be a valid number, got '{latitude}'"
                )
        
        # Validate and convert longitude
        longitude_float = None
        if longitude:
            try:
                longitude_float = float(longitude.strip())
                if not (-180 <= longitude_float <= 180):
                    raise HTTPException(
                        status_code=422,
                        detail=f"Validation error: 'longitude' must be between -180 and 180, got {longitude_float}"
                    )
            except HTTPException:
                raise  # Re-raise HTTPException as-is
            except (ValueError, TypeError) as e:
                raise HTTPException(
                    status_code=422,
                    detail=f"Validation error: 'longitude' must be a valid number, got '{longitude}'"
                )
        
        # Read and validate image file if provided
        image_bytes = None
        MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
        if image:
            try:
                # Check content type if available (informational only, not strict)
                if image.content_type:
                    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
                    if image.content_type not in allowed_types:
                        print(f"Warning: Unexpected content type '{image.content_type}', continuing anyway")
                
                # Read image with size limit
                image_bytes = await image.read()
                if len(image_bytes) > MAX_IMAGE_SIZE:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Validation error: Image file too large. Maximum size is {MAX_IMAGE_SIZE / (1024*1024):.1f}MB, got {len(image_bytes) / (1024*1024):.1f}MB"
                    )
                if len(image_bytes) == 0:
                    raise HTTPException(
                        status_code=422,
                        detail="Validation error: Image file is empty"
                    )
                print(f"Received image: {len(image_bytes)} bytes, content_type: {image.content_type}")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=422,
                    detail=f"Validation error: Failed to read image file: {str(e)}"
                )
        
        # Prepare report data
        report_data = {
            "report_id": report_id,
            "description": description,
            "user_id": user_id,
            "image_bytes": image_bytes,  # Changed from image_url to image_bytes
            "latitude": latitude_float,
            "longitude": longitude_float
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
