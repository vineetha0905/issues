from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="CivicConnect API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Enums
class IssueStatus(str, Enum):
    REPORTED = "reported"
    IN_PROGRESS = "in-progress"
    RESOLVED = "resolved"

class IssuePriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    mobile: Optional[str] = None
    is_guest: bool = False
    is_admin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Issue(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    category: str
    location: str
    coordinates: List[float]
    status: IssueStatus = IssueStatus.REPORTED
    priority: IssuePriority = IssuePriority.MEDIUM
    upvotes: int = 0
    assigned_to: str = "Unassigned"
    reported_by: str
    user_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    image_url: Optional[str] = None

class Comment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    issue_id: str
    user_id: str
    author: str
    content: str
    is_admin: bool = False
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Request Models
class AdminLoginRequest(BaseModel):
    username: str
    password: str

class SendOTPRequest(BaseModel):
    mobile: str

class VerifyOTPRequest(BaseModel):
    mobile: str
    otp: str

class CreateIssueRequest(BaseModel):
    title: str
    description: str
    category: str
    location: str
    coordinates: List[float]
    user_id: str
    reported_by: str

class UpdateIssueRequest(BaseModel):
    status: Optional[IssueStatus] = None
    assigned_to: Optional[str] = None
    priority: Optional[IssuePriority] = None

class CreateCommentRequest(BaseModel):
    content: str
    user_id: str
    author: str
    is_admin: bool = False

# Legacy endpoints (keep for compatibility)
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

@api_router.get("/")
async def root():
    return {"message": "CivicConnect API v1.0.0", "status": "active"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Authentication endpoints
@api_router.post("/auth/admin/login")
async def admin_login(request: AdminLoginRequest):
    # Simple mock authentication for demo
    if request.username == "admin" and request.password == "admin123":
        admin_user = {
            "id": "admin",
            "name": "Admin User",
            "username": request.username,
            "is_admin": True,
            "token": "mock_admin_token"
        }
        return {"success": True, "user": admin_user, "message": "Login successful"}
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@api_router.post("/auth/send-otp")
async def send_otp(request: SendOTPRequest):
    # Mock OTP sending - in real app, integrate with SMS service
    if len(request.mobile) != 10 or not request.mobile.isdigit():
        raise HTTPException(status_code=400, detail="Invalid mobile number format")
    
    # Mock: Always return success for demo
    return {
        "success": True,
        "message": f"OTP sent to +91 {request.mobile}",
        "otp": "123456"  # Mock OTP for demo
    }

@api_router.post("/auth/verify-otp")
async def verify_otp(request: VerifyOTPRequest):
    # Mock OTP verification
    if request.otp == "123456":
        user = User(
            name=f"User {request.mobile[-4:]}",
            mobile=request.mobile,
            is_guest=False
        )
        user_dict = user.dict()
        user_dict['timestamp'] = user_dict['created_at'].isoformat()
        del user_dict['created_at']
        
        await db.users.insert_one(user_dict)
        return {"success": True, "user": user.dict(), "message": "OTP verified successfully"}
    else:
        raise HTTPException(status_code=400, detail="Invalid OTP")

@api_router.post("/auth/guest")
async def create_guest():
    guest_user = User(
        name="Guest User",
        is_guest=True
    )
    user_dict = guest_user.dict()
    user_dict['timestamp'] = user_dict['created_at'].isoformat()
    del user_dict['created_at']
    
    await db.users.insert_one(user_dict)
    return {"success": True, "user": guest_user.dict(), "message": "Guest user created"}

# Issues endpoints
@api_router.get("/issues")
async def get_issues(status: Optional[str] = None, category: Optional[str] = None):
    # Build query
    query = {}
    if status and status != "all":
        query["status"] = status
    if category:
        query["category"] = category
    
    # Get issues from database
    issues = await db.issues.find(query).to_list(1000)
    
    # Remove MongoDB ObjectId from results
    for issue in issues:
        if '_id' in issue:
            del issue['_id']
    
    # If no issues found, return mock data for demo
    if not issues:
        mock_issues = [
            {
                "id": "1",
                "title": "Broken Street Light",
                "description": "Street light has been broken for 3 days causing safety concerns",
                "category": "Street Lighting",
                "location": "MG Road, Bhopal",
                "coordinates": [23.2599, 77.4126],
                "status": "reported",
                "priority": "high",
                "upvotes": 15,
                "assigned_to": "Unassigned",
                "reported_by": "Citizen #1234",
                "user_id": "demo_user_1",
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": "2",
                "title": "Pothole on Main Road",
                "description": "Large pothole causing traffic issues and vehicle damage",
                "category": "Road & Traffic",
                "location": "DB City Mall Road",
                "coordinates": [23.2456, 77.4200],
                "status": "in-progress",
                "priority": "medium",
                "upvotes": 28,
                "assigned_to": "Ward Officer A",
                "reported_by": "Citizen #5678",
                "user_id": "demo_user_2",
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": "3",
                "title": "Garbage Overflow",
                "description": "Garbage bin overflowing since Monday, creating unhygienic conditions",
                "category": "Garbage & Sanitation",
                "location": "Arera Colony",
                "coordinates": [23.2300, 77.4300],
                "status": "resolved",
                "priority": "low",
                "upvotes": 42,
                "assigned_to": "Sanitation Team B",
                "reported_by": "Citizen #9012",
                "user_id": "demo_user_3",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        ]
        
        # Insert mock data
        await db.issues.insert_many(mock_issues)
        return {"success": True, "issues": mock_issues}
    
    return {"success": True, "issues": issues}

@api_router.post("/issues", status_code=201)
async def create_issue(request: CreateIssueRequest):
    issue = Issue(
        title=request.title,
        description=request.description,
        category=request.category,
        location=request.location,
        coordinates=request.coordinates,
        user_id=request.user_id,
        reported_by=request.reported_by
    )
    
    issue_dict = issue.dict()
    issue_dict['timestamp'] = issue_dict['timestamp'].isoformat()
    
    result = await db.issues.insert_one(issue_dict)
    issue_dict['_id'] = str(result.inserted_id)
    
    return {"success": True, "issue": issue_dict, "message": "Issue created successfully"}

@api_router.get("/issues/{issue_id}")
async def get_issue(issue_id: str):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    return {"success": True, "issue": issue}

@api_router.put("/issues/{issue_id}")
async def update_issue(issue_id: str, request: UpdateIssueRequest):
    update_data = {}
    if request.status:
        update_data["status"] = request.status
    if request.assigned_to:
        update_data["assigned_to"] = request.assigned_to
    if request.priority:
        update_data["priority"] = request.priority
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.issues.update_one(
        {"id": issue_id}, 
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    return {"success": True, "message": "Issue updated successfully"}

@api_router.post("/issues/{issue_id}/upvote")
async def upvote_issue(issue_id: str, user_id: str):
    # Check if issue exists
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    # In a real app, you'd track who voted to prevent duplicate votes
    result = await db.issues.update_one(
        {"id": issue_id},
        {"$inc": {"upvotes": 1}}
    )
    
    return {"success": True, "message": "Issue upvoted successfully"}

@api_router.post("/issues/{issue_id}/comments")
async def add_comment(issue_id: str, request: CreateCommentRequest):
    # Check if issue exists
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    comment = Comment(
        issue_id=issue_id,
        user_id=request.user_id,
        author=request.author,
        content=request.content,
        is_admin=request.is_admin
    )
    
    comment_dict = comment.dict()
    comment_dict['timestamp'] = comment_dict['timestamp'].isoformat()
    
    await db.comments.insert_one(comment_dict)
    return {"success": True, "comment": comment_dict, "message": "Comment added successfully"}

@api_router.get("/issues/{issue_id}/comments")
async def get_comments(issue_id: str):
    comments = await db.comments.find({"issue_id": issue_id}).to_list(1000)
    return {"success": True, "comments": comments}

# Admin endpoints
@api_router.get("/admin/dashboard")
async def get_admin_dashboard():
    # Get statistics
    total_issues = await db.issues.count_documents({})
    reported = await db.issues.count_documents({"status": "reported"})
    in_progress = await db.issues.count_documents({"status": "in-progress"})
    resolved = await db.issues.count_documents({"status": "resolved"})
    
    # Mock some additional stats
    stats = {
        "total_issues": total_issues if total_issues > 0 else 156,
        "reported": reported if reported > 0 else 45,
        "in_progress": in_progress if in_progress > 0 else 67,
        "resolved": resolved if resolved > 0 else 44,
        "sla_breaches": 8,
        "avg_resolution_time": "3.2 days"
    }
    
    return {"success": True, "stats": stats}

@api_router.get("/admin/analytics")
async def get_analytics():
    # Mock analytics data
    analytics = {
        "categories": [
            {"name": "Road & Traffic", "count": 45, "percentage": 35},
            {"name": "Street Lighting", "count": 32, "percentage": 25},
            {"name": "Water & Drainage", "count": 28, "percentage": 22},
            {"name": "Garbage & Sanitation", "count": 23, "percentage": 18}
        ],
        "resolution_trends": {
            "this_week": 85,
            "last_week": 78,
            "improvement": 7
        }
    }
    
    return {"success": True, "analytics": analytics}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()