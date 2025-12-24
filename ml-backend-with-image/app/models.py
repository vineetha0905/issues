from pydantic import BaseModel, Field, field_validator
from typing import Optional

class ReportFormFields(BaseModel):
    """
    Pydantic model for form fields only (not including file uploads).
    Images are handled separately via FastAPI's UploadFile + File().
    This model can be used for validation and documentation.
    """
    report_id: str = Field(..., min_length=1, description="Unique identifier for the report")
    description: str = Field(..., min_length=1, description="Description of the issue")
    user_id: Optional[str] = Field(None, description="Optional user identifier")
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude coordinate (-90 to 90)")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude coordinate (-180 to 180)")
    
    @field_validator('report_id', 'description')
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        """Ensure required fields are not empty strings"""
        if not v or not v.strip():
            raise ValueError('Field cannot be empty')
        return v.strip()

# Legacy model - kept for backward compatibility but not recommended for form validation
# Use ReportFormFields instead, and handle images via UploadFile in the endpoint
class ReportIn(BaseModel):
    """Legacy model. For form data, use ReportFormFields + UploadFile instead."""
    report_id: str
    description: str
    user_id: Optional[str] = None
    # Note: image_bytes should NOT be in Pydantic models for form validation
    # Use FastAPI's UploadFile + File() in the endpoint instead
    image_bytes: Optional[bytes] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ReportStatus(BaseModel):
    report_id: str
    accept: bool
    status: str
    category: str
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    urgency: Optional[str] = None  # Only if accepted
    reason: str
