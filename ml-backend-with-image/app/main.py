from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    from app.pipeline import classify_report
    ml_available = True
    print("✅ ML modules loaded successfully")
except Exception as e:
    print(f"⚠️ ML modules not available (non-critical): {e}")
    print("⚠️ API will return default responses")

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
async def submit_report(request: Request):
    """
    Submit a report for ML validation and classification.
    Accepts JSON with required fields: report_id, description
    """
    try:
        # Parse JSON body
        try:
            body = await request.json()
        except:
            body = await request.body()
            body = json.loads(body.decode('utf-8'))
        
        report_id = body.get("report_id")
        description = body.get("description")
        
        print(f"Received ML validation request: report_id={report_id}, description_length={len(description or '')}")
        
        # Validate required fields
        if not report_id or not description:
            raise HTTPException(
                status_code=400, 
                detail="Missing required fields: report_id and description are required"
            )
        
        # Check if ML is available
        if not ml_available or classify_report is None:
            print("⚠️ ML not available, returning default acceptance")
            # Return default acceptance if ML is not available
            return {
                "report_id": report_id,
                "accept": True,
                "status": "accepted",
                "category": "Other",
                "department": "Other",
                "urgency": "low",
                "priority": "medium",
                "reason": "ML service unavailable, default acceptance"
            }
        
        # Prepare report data
        report_data = {
            "report_id": report_id,
            "description": description,
            "user_id": body.get("user_id"),
            "image_url": body.get("image_url"),
            "latitude": body.get("latitude"),
            "longitude": body.get("longitude"),
            "category": body.get("category")
        }
        
        # Classify the report using ML
        print("Starting ML classification...")
        result = classify_report(report_data)
        print(f"ML classification complete: status={result.get('status')}, category={result.get('category')}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in submit_report: {str(e)}")
        print(traceback.format_exc())
        # Return error response instead of crashing
        return JSONResponse(
            status_code=500,
            content={
                "report_id": body.get("report_id", "unknown") if 'body' in locals() else "unknown",
                "accept": False,
                "status": "error",
                "category": "Other",
                "reason": f"ML processing error: {str(e)}"
            }
        )
