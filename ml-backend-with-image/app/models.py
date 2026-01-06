from pydantic import BaseModel, Field, field_validator
from typing import Optional

class ReportRequest(BaseModel):
    """
    Pydantic model for JSON-based report submission.
    Accepts image as base64-encoded string instead of multipart/form-data.
    """
    report_id: str = Field(..., min_length=1, description="Unique identifier for the report")
    description: str = Field(..., min_length=1, description="Description of the issue")
    user_id: Optional[str] = Field(None, description="Optional user identifier")
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude coordinate (-90 to 90)")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude coordinate (-180 to 180)")
    image_base64: Optional[str] = Field(None, description="Optional image file as base64-encoded string (data URI or plain base64)")
    
    @field_validator('report_id', 'description')
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        """Ensure required fields are not empty strings"""
        if not v or not v.strip():
            raise ValueError('Field cannot be empty')
        return v.strip()
    
    @field_validator('image_base64')
    @classmethod
    def validate_image_base64(cls, v: Optional[str]) -> Optional[str]:
        """Validate base64 image format"""
        if v is None:
            return None
        if not v.strip():
            return None
        
        # Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
        image_data = v.strip()
        if ',' in image_data:
            image_data = image_data.split(',', 1)[1]
        
        # Validate base64 format
        import base64
        try:
            # Try to decode to verify it's valid base64
            base64.b64decode(image_data, validate=True)
            return v  # Return original with prefix if it had one
        except Exception:
            raise ValueError('Invalid base64-encoded image data')

# Legacy models - kept for backward compatibility
class ReportFormFields(BaseModel):
    """
    DEPRECATED: Legacy model for form fields only.
    Use ReportRequest instead for JSON-based requests.
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

class ReportIn(BaseModel):
    """DEPRECATED: Legacy model."""
    report_id: str
    description: str
    user_id: Optional[str] = None
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
