from pydantic import BaseModel
from typing import Optional

class ReportIn(BaseModel):
    report_id: str
    description: str
    category: Optional[str] = None  # Optional - will be auto-detected by pipeline if not provided
    user_id: Optional[str] = None
    image_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ReportStatus(BaseModel):
    report_id: str
    status: str
    reason: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    text_category: Optional[str] = None
    image_category: Optional[str] = None
