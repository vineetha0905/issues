from PIL import Image
import imagehash
import requests
import io
import json
from pathlib import Path
from math import radians, cos, sin, asin, sqrt

# Import dataset module to access the dataset file
from app import dataset

def _load_accepted_reports():
    """Load all accepted reports from dataset.jsonl."""
    try:
        if not dataset.DATA_FILE.exists():
            return []
        
        accepted_reports = []
        with dataset.DATA_FILE.open("r", encoding="utf8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    report = json.loads(line)
                    # Only include accepted reports
                    if report.get("status") == "accepted" and report.get("accept") is True:
                        accepted_reports.append(report)
                except json.JSONDecodeError:
                    continue  # Skip invalid JSON lines
        
        return accepted_reports
    except Exception as e:
        print(f"[ERROR] Failed to load accepted reports from dataset: {str(e)}")
        return []


def is_duplicate(user_id: str, description: str, category: str, store: bool = True) -> bool:
    """
    Check if this exact report has been submitted before by checking dataset.jsonl.
    Only returns True for exact matches (same user, same description, same category).
    Only checks ACCEPTED reports from dataset.jsonl.
    Set store=False to check without storing (for validation before acceptance).
    Note: store parameter is kept for compatibility but doesn't do anything (data is stored via dataset.save_report).
    """
    try:
        # Normalize the description - remove extra whitespace
        normalized_desc = " ".join(description.strip().lower().split())
        user_id_normalized = (user_id or "anon").lower()
        category_normalized = category.lower()
        
        # Load all accepted reports from dataset
        accepted_reports = _load_accepted_reports()
        
        # Check each accepted report
        for report in accepted_reports:
            report_user_id = (report.get("user_id") or "anon").lower()
            report_desc = " ".join((report.get("description") or "").strip().lower().split())
            report_category = (report.get("category") or "").lower()
            
            # Check for exact match
            if (report_user_id == user_id_normalized and 
                report_desc == normalized_desc and 
                report_category == category_normalized):
                print(f"[DEBUG] Text duplicate found in dataset: user_id={user_id_normalized}, category={category}")
                return True
        
        return False
    except Exception as e:
        print(f"[ERROR] Text duplicate check failed: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return False  # On error, don't block submission

def is_duplicate_image(image_url: str, threshold: int = 0, store: bool = True) -> bool:
    """Check if an image is a duplicate using URL first, then perceptual hash (pHash).
    Checks ACCEPTED reports from dataset.jsonl.
    threshold = maximum Hamming distance allowed to consider images equal.
    threshold=0 means EXACT hash match only (most strict).
    Set store=False to check without storing (for validation before acceptance).
    DEPRECATED: Use is_duplicate_image_from_bytes instead.
    Note: store parameter is kept for compatibility but doesn't do anything (data is stored via dataset.save_report).
    """
    if not image_url:
        return False
    
    try:
        # Step 1: Quick URL-based check (exact match) - check dataset for image URLs
        try:
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(image_url)
            normalized_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))
            
            # Load accepted reports and check for URL match
            accepted_reports = _load_accepted_reports()
            for report in accepted_reports:
                # Check if report has image_url stored
                report_image_url = report.get("image_url")
                if report_image_url:
                    try:
                        report_parsed = urlparse(report_image_url)
                        report_normalized = urlunparse((report_parsed.scheme, report_parsed.netloc, report_parsed.path, '', '', ''))
                        if report_normalized == normalized_url:
                            print(f"[DEBUG] Duplicate detected: Exact URL match in dataset for {normalized_url}")
                            return True
                    except Exception:
                        continue
        except Exception as e:
            print(f"[WARNING] URL normalization failed: {str(e)}")
            # Continue with hash check
        
        # Step 2: Hash-based check (only for exact matches with threshold=0)
        try:
            resp = requests.get(image_url, timeout=10)
            resp.raise_for_status()
            img = Image.open(io.BytesIO(resp.content)).convert('RGB')
            img_hash = imagehash.phash(img)
            img_hash_int = int(str(img_hash), 16)

            # Load accepted reports and check for hash match
            accepted_reports = _load_accepted_reports()
            for report in accepted_reports:
                report_hash = report.get("image_hash")
                if report_hash is not None:
                    try:
                        if isinstance(report_hash, str):
                            report_hash_int = int(report_hash, 16)
                        else:
                            report_hash_int = int(report_hash)
                        
                        if abs(img_hash_int - report_hash_int) == 0:
                            print(f"[DEBUG] Duplicate detected: Exact hash match in dataset")
                            return True
                    except (ValueError, TypeError):
                        continue
            
            return False
        except Exception as e:
            # On any failure to fetch/process image, treat as non-duplicate
            print(f"[ERROR] Image hash check failed for {image_url}: {str(e)}")
            return False
    except Exception as e:
        print(f"[ERROR] Image duplicate check failed: {str(e)}")
        return False


def is_duplicate_image_from_bytes(image_bytes: bytes, threshold: int = 0, store: bool = True) -> bool:
    """Check if an image is a duplicate using perceptual hash (pHash) from bytes.
    Works with image bytes directly (no URL required).
    Checks ACCEPTED reports from dataset.jsonl for image hashes.
    threshold = maximum Hamming distance allowed to consider images equal.
    threshold=0 means EXACT hash match only (most strict).
    Set store=False to check without storing (for validation before acceptance).
    Note: store parameter is kept for compatibility but doesn't do anything (image hash is stored via dataset.save_report).
    """
    if not image_bytes:
        return False
    
    try:
        # Open image directly from bytes and compute hash
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img_hash = imagehash.phash(img)
        img_hash_int = int(str(img_hash), 16)  # Convert to integer for comparison

        # Load all accepted reports from dataset
        accepted_reports = _load_accepted_reports()
        
        # Check each accepted report for image hash
        for report in accepted_reports:
            # Check if report has image_hash stored
            report_hash = report.get("image_hash")
            if report_hash is not None:
                try:
                    # Compare hashes (exact match for threshold=0)
                    if isinstance(report_hash, str):
                        report_hash_int = int(report_hash, 16)
                    else:
                        report_hash_int = int(report_hash)
                    
                    # With threshold=0, only exact hash matches are duplicates
                    if abs(img_hash_int - report_hash_int) == 0:
                        print(f"[DEBUG] Image duplicate detected: Exact hash match in dataset")
                        return True
                except (ValueError, TypeError):
                    continue  # Skip invalid hash values
        
        return False
    except Exception as e:
        # On any failure to process image, treat as non-duplicate
        # Log the error for debugging but don't block submission
        print(f"[ERROR] Image hash check failed: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return False

def haversine(lat1, lon1, lat2, lon2):
    """Calculate great-circle distance between two lat/lon points in meters."""
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    a = sin(delta_lat/2)**2 + cos(lat1) * cos(lat2) * sin(delta_lon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371000  # Earth radius in meters
    return c * r

def is_duplicate_location(lat: float, lon: float, description: str, category: str, threshold: float = 10.0, store: bool = True) -> bool:
    """
    Return True if an existing ACCEPTED report with same category exists within threshold meters.
    Checks dataset.jsonl for accepted reports with same category within threshold (default 10 meters).
    Set store=False to check without storing (for validation before acceptance).
    threshold can be a float for more precise control (e.g., 10.0 meters).
    Note: store parameter is kept for compatibility but doesn't do anything (location is stored via dataset.save_report).
    """
    try:
        # Load all accepted reports from dataset
        accepted_reports = _load_accepted_reports()
        
        category_normalized = category.lower()
        
        # Check each accepted report
        for report in accepted_reports:
            report_category = (report.get("category") or "").lower()
            
            # Check for same category
            if report_category == category_normalized:
                # Get location from report
                report_lat = report.get("latitude")
                report_lon = report.get("longitude")
                
                if report_lat is not None and report_lon is not None:
                    # Calculate distance
                    dist = haversine(lat, lon, float(report_lat), float(report_lon))
                    # Consider duplicate if same category within threshold meters
                    if dist <= threshold:
                        print(f"[DEBUG] Location duplicate found in dataset: ({lat}, {lon}) is {dist:.2f}m from ({report_lat}, {report_lon}) for category '{category}'")
                        return True
        
        return False
    except Exception as e:
        # On error, don't block submission - be permissive
        print(f"[ERROR] Location duplicate check failed: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return False
