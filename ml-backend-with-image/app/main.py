from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.pipeline import classify_report
from app.models import ReportIn
import traceback
import os

app = FastAPI(title="Civic ML Backend API")

# Note: Models are loaded lazily (on first use) to save memory
# CLIP model will be loaded when first image classification is needed

# CORS configuration
# IMPORTANT: When allow_credentials=True, you CANNOT use allow_origins=["*"]
# Since this ML endpoint doesn't need credentials (cookies/auth headers), 
# we set allow_credentials=False and can safely use allow_origins=["*"]
# For production, you can restrict origins by setting CORS_ORIGINS env var

# Get allowed origins from environment variable (comma-separated)
cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env:
    # Use specific origins from environment
    cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
else:
    # Default: Allow all origins (safe because credentials=False)
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,  # No credentials needed - allows wildcard origins
    allow_methods=["GET", "POST", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/")
def health():
    return {"status": "ML API running"}

@app.post("/submit")
async def submit_report(data: ReportIn):
    """
    Submit a report for ML validation and classification.
    Accepts ReportIn model with required fields: report_id, description
    """
    try:
        # Convert Pydantic model to dict for pipeline
        report_data = data.dict()
        
        # Validate required fields
        if not report_data.get("report_id") or not report_data.get("description"):
            raise HTTPException(
                status_code=400, 
                detail="Missing required fields: report_id and description are required"
            )
        
        # Classify the report
        result = classify_report(report_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in submit_report: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
