# API Request Examples for `/submit` Endpoint

This document provides working examples for the `/submit` endpoint that accepts multipart/form-data.

## Endpoint Details

- **URL**: `POST /submit`
- **Content-Type**: `multipart/form-data`
- **Required fields**: `report_id`, `description`
- **Optional fields**: `user_id`, `latitude`, `longitude`, `image`

## Example 1: Basic Request (No Image)

### cURL

```bash
curl -X POST "http://localhost:8000/submit" \
  -F "report_id=test-123" \
  -F "description=Pothole on Main Street near the intersection with Oak Avenue. It's quite large and dangerous for vehicles."
```

### Python (requests)

```python
import requests

url = "http://localhost:8000/submit"
data = {
    "report_id": "test-123",
    "description": "Pothole on Main Street near the intersection with Oak Avenue. It's quite large and dangerous for vehicles."
}

response = requests.post(url, data=data)
print(response.status_code)
print(response.json())
```

## Example 2: Request with All Optional Fields (No Image)

### cURL

```bash
curl -X POST "http://localhost:8000/submit" \
  -F "report_id=test-456" \
  -F "description=Overflowing garbage bin on Park Avenue causing bad smell" \
  -F "user_id=user-789" \
  -F "latitude=37.7749" \
  -F "longitude=-122.4194"
```

### Python (requests)

```python
import requests

url = "http://localhost:8000/submit"
data = {
    "report_id": "test-456",
    "description": "Overflowing garbage bin on Park Avenue causing bad smell",
    "user_id": "user-789",
    "latitude": "37.7749",
    "longitude": "-122.4194"
}

response = requests.post(url, data=data)
print(response.status_code)
print(response.json())
```

## Example 3: Request with Image File

### cURL

```bash
curl -X POST "http://localhost:8000/submit" \
  -F "report_id=test-789" \
  -F "description=Damaged streetlight on Elm Street not working at night" \
  -F "user_id=user-123" \
  -F "latitude=40.7128" \
  -F "longitude=-74.0060" \
  -F "image=@/path/to/your/image.jpg"
```

### Python (requests)

```python
import requests

url = "http://localhost:8000/submit"

# Prepare form data
data = {
    "report_id": "test-789",
    "description": "Damaged streetlight on Elm Street not working at night",
    "user_id": "user-123",
    "latitude": "40.7128",
    "longitude": "-74.0060"
}

# Add image file
files = {
    "image": ("image.jpg", open("/path/to/your/image.jpg", "rb"), "image/jpeg")
}

response = requests.post(url, data=data, files=files)
print(response.status_code)
print(response.json())

# Don't forget to close the file
files["image"][1].close()
```

### Python (with context manager)

```python
import requests

url = "http://localhost:8000/submit"

data = {
    "report_id": "test-789",
    "description": "Damaged streetlight on Elm Street not working at night",
    "user_id": "user-123",
    "latitude": "40.7128",
    "longitude": "-74.0060"
}

# Using context manager for automatic file handling
with open("/path/to/your/image.jpg", "rb") as img_file:
    files = {
        "image": ("image.jpg", img_file, "image/jpeg")
    }
    response = requests.post(url, data=data, files=files)
    print(response.status_code)
    print(response.json())
```

## Example 4: Request with Image Only (Minimal Fields)

### cURL

```bash
curl -X POST "http://localhost:8000/submit" \
  -F "report_id=test-999" \
  -F "description=Broken traffic signal at downtown intersection" \
  -F "image=@/path/to/your/image.png"
```

### Python (requests)

```python
import requests

url = "http://localhost:8000/submit"

data = {
    "report_id": "test-999",
    "description": "Broken traffic signal at downtown intersection"
}

with open("/path/to/your/image.png", "rb") as img_file:
    files = {"image": ("image.png", img_file, "image/png")}
    response = requests.post(url, data=data, files=files)
    print(response.status_code)
    print(response.json())
```

## Example 5: Using FastAPI Test Client (for testing)

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Test without image
response = client.post(
    "/submit",
    data={
        "report_id": "test-001",
        "description": "Waterlogging in residential area after heavy rain"
    }
)
print(response.status_code)
print(response.json())

# Test with image
with open("/path/to/your/image.jpg", "rb") as img_file:
    response = client.post(
        "/submit",
        data={
            "report_id": "test-002",
            "description": "Pothole on highway",
            "latitude": "40.7128",
            "longitude": "-74.0060"
        },
        files={"image": ("image.jpg", img_file, "image/jpeg")}
    )
    print(response.status_code)
    print(response.json())
```

## Expected Response Format

### Success Response

```json
{
  "report_id": "test-123",
  "accept": true,
  "status": "accepted",
  "category": "Road & Traffic",
  "confidence": 0.85,
  "urgency": "medium",
  "reason": "Report accepted successfully"
}
```

### Rejection Response

```json
{
  "report_id": "test-123",
  "accept": false,
  "status": "rejected",
  "category": "Other",
  "confidence": 0.15,
  "reason": "Unable to determine issue category. Please provide more details."
}
```

## Error Responses

### 422 Validation Error Examples

```json
{
  "detail": "Validation error: 'report_id' is required and cannot be empty"
}
```

```json
{
  "detail": "Validation error: 'latitude' must be between -90 and 90, got 95.5"
}
```

```json
{
  "detail": "Validation error: Image file too large. Maximum size is 10.0MB, got 15.5MB"
}
```

## Notes

1. **Content-Type**: Do NOT manually set `Content-Type: multipart/form-data` header. The HTTP client/library will automatically set it with the correct boundary.

2. **Image Formats**: Supported image formats include JPEG, JPG, PNG, GIF, and WebP.

3. **Image Size Limit**: Maximum image size is 10MB.

4. **Latitude/Longitude**: 
   - Must be valid numbers (strings that can be converted to float)
   - Latitude: -90 to 90
   - Longitude: -180 to 180

5. **Required Fields**: 
   - `report_id`: Cannot be empty
   - `description`: Cannot be empty

6. **Base URL**: Replace `http://localhost:8000` with your actual API base URL (e.g., `https://your-api.render.com` for production).

