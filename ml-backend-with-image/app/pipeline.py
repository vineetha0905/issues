from app import storage, dataset
from app import image_classifier as ic
from app.text_rules import (
    is_abusive,
    detect_category,
    detect_urgency,
    CATEGORY_KEYWORDS
)

# Confidence threshold for category detection
CATEGORY_CONFIDENCE_THRESHOLD = 0.1  # Minimum confidence to accept category (lowered to reduce false rejections)
import warnings

warnings.filterwarnings("ignore", category=UserWarning, message=".*pkg_resources.*")


# ------------------------------------
# Image → Category reference (COMPREHENSIVE)
# ------------------------------------
IMAGE_TO_CATEGORY_MAP = {
    "Road & Traffic": [
        "pothole", "damaged road", "illegal parking", "broken footpath",
        "traffic signal not working", "road accident", "road", "street", "traffic",
        "speed breaker", "crosswalk", "footpath", "pavement", "crack", "broken road",
        "road caved", "road sinking", "uneven road", "traffic jam", "congestion",
        "signal", "junction", "crossroad", "accident", "collision", "crash", "hit",
        "speed bump", "divider", "sidewalk", "zebra crossing", "pedestrian", "highway",
        "bridge", "intersection", "pavement", "asphalt"
    ],
    "Garbage & Sanitation": [
        "garbage dump", "overflowing dustbin", "open drain", "sewage overflow",
        "dead animal", "toilet issue", "garbage", "trash", "waste", "bin",
        "sanitation", "dirty", "sewage", "cleanliness", "dustbin", "dump", "dumping",
        "garbage pile", "waste pile", "filthy", "unclean", "bad smell", "toxic smell",
        "foul smell", "overflowing bin", "sewer", "manhole", "dead", "animal carcass",
        "dead dog", "dead cat", "dead cow", "dead body", "mosquito", "flies", "infection", "disease"
    ],
    "Street Lighting": [
        "streetlight not working", "fallen electric pole", "loose wire", "power outage",
        "streetlight", "lamp", "bulb", "pole", "light", "electric pole",
        "street lamp", "lighting", "dark area", "electricity", "power",
        "broken streetlight", "non-working light", "flickering light", "dim light",
        "street lighting", "outdoor lighting", "public lighting", "night lighting",
        "lamp post", "pole light", "not working", "broken light", "flickering",
        "dark", "no lighting", "illumination"
    ],
    "Water & Drainage": [
        "waterlogging", "pipe burst", "no water supply", "drainage issue", "flood",
        "drain", "drainage", "sewage", "sewer", "leak", "leaking", "leakage",
        "pipe", "water", "overflow", "water supply", "drainage system",
        "no water", "low pressure", "drinking water", "contaminated water",
        "pipe leak", "broken pipe", "blocked drain", "overflowing drain",
        "stagnant water", "sewage water", "rain water", "water pipe"
    ],
    "Parks & Recreation": [
        "tree fallen", "illegal construction", "park maintenance", "encroachment",
        "park", "garden", "playground", "tree", "bench", "grass", "lawn",
        "recreation", "green space", "park area", "garden area", "flooded park",
        "water in park", "park with water", "playground equipment", "walking path",
        "fountain", "pond", "lake", "outdoor space", "public space",
        "children park", "public park", "swing", "slide", "walking track",
        "fallen tree", "broken fence", "garden bench"
    ],
    "Public Safety": [
        "fire", "gas leak", "building collapse", "accident site",
        "crime", "robbery", "theft", "violence", "hazard", "danger",
        "safety", "harassment", "emergency", "accident", "smoke", "burning",
        "gas", "cylinder leak", "collapse", "wall collapse", "roof falling",
        "theft", "fight", "assault", "unsafe", "life risk", "explosion"
    ],
    "Electricity": [
        "electric", "electricity", "power", "outage", "wire", "transformer",
        "short circuit", "shock", "cable", "meter", "electrical", "voltage", "current",
        "no power", "power cut", "pole", "electric pole", "spark",
        "electrocution", "electric shock", "live wire", "power line"
    ]
}

GENERIC_IMAGE_LABELS = {
    "other", "outdoor", "outdoor space", "public space", "area", "scene", "general"
}


# ------------------------------------
# Model initialization
# ------------------------------------
def initialize_models():
    """Initialize ML models (CLIP for image classification)"""
    try:
        ic.initialize_clip()
    except Exception as e:
        print(f"Model initialization failed (will use fallback): {str(e)}")
        pass


# ------------------------------------
# Main pipeline (OPTIMIZED)
# ------------------------------------
def classify_report(report: dict):
    try:
        description = (report.get("description") or "").strip()
        if not description:
            return reject(report, "Description is required", confidence=0.0)

        # Category detection with confidence scoring
        try:
            category, confidence = detect_category(description)
        except Exception as e:
            print(f"[ERROR] Category detection failed: {str(e)}")
            import traceback
            print(traceback.format_exc())
            return reject(report, f"Category detection error: {str(e)}", "Other", 0.0)
        
        # Reject if category is "Other" or confidence is below threshold
        if category == "Other" or confidence < CATEGORY_CONFIDENCE_THRESHOLD:
            return reject(report, "Unable to determine issue category. Please provide more details.", category, confidence)

        if is_abusive(description):
            return reject(report, "Abusive language detected", category, confidence)

        # Check for same user duplicate (same user, same description, same category)
        user_id = report.get("user_id", "anon")
        try:
            if storage.is_duplicate(user_id, description, category, store=False):
                return reject(report, "You have already submitted this report.", category, confidence)
        except Exception as e:
            print(f"[ERROR] Text duplicate check failed: {str(e)}")
            # Continue - don't block on technical errors

        # Check for location-based duplicate (same category within 10 meters)
        latitude = report.get("latitude")
        longitude = report.get("longitude")
        if latitude is not None and longitude is not None:
            try:
                if storage.is_duplicate_location(latitude, longitude, description, category, threshold=10.0, store=False):
                    return reject(report, "A similar issue has already been reported at this location.", category, confidence)
            except Exception as e:
                print(f"[ERROR] Location duplicate check failed: {str(e)}")
                # Continue - don't block on technical errors

        # STEP 1: Check image against detected category FIRST (BEFORE duplicate check)
        image_bytes = report.get("image_bytes")  # Changed from image_url to image_bytes
        if image_bytes:
            print(f"[DEBUG] Processing image for category '{category}' (image size: {len(image_bytes)} bytes)")
            
            try:
                # CRITICAL: Validate image matches category FIRST
                # If image doesn't match, reject immediately - don't check duplicates
                image_matches = image_matches_category_from_bytes(image_bytes, category)
                
                if not image_matches:
                    # Image doesn't match category - reject immediately
                    print(f"[DEBUG] Image does NOT match category '{category}' - rejecting without duplicate check")
                    return reject(
                        report,
                        "Image does not match the issue description. Please provide an image related to the reported category.",
                        category,
                        confidence
                    )
                
                print(f"[DEBUG] Image matches category '{category}' - proceeding to duplicate check")
                
                # STEP 2: Only check for duplicates if image matches category
                try:
                    # Check for duplicates with threshold=0 (EXACT match only - most strict)
                    print(f"[DEBUG] Checking for duplicate image")
                    is_dup = storage.is_duplicate_image_from_bytes(image_bytes, threshold=0, store=False)
                    
                    if is_dup:
                        print(f"[DEBUG] DUPLICATE DETECTED")
                        return reject(report, "Duplicate image detected. This image has already been used in another report.", category, confidence)
                    
                    print(f"[DEBUG] Image is NOT duplicate - will be stored in dataset after acceptance")
                    # Image hash will be stored in dataset when report is saved
                except Exception as e:
                    # If duplicate check fails, allow submission (don't block on technical errors)
                    print(f"[ERROR] Duplicate check failed (allowing submission): {str(e)}")
                    import traceback
                    print(traceback.format_exc())
                    # Continue - don't block legitimate reports due to technical issues
            except Exception as e:
                print(f"[ERROR] Image validation failed: {str(e)}")
                import traceback
                print(traceback.format_exc())
                # If image validation fails, reject the report
                return reject(report, f"Image validation error: {str(e)}", category, confidence)

        urgency = detect_urgency(description)
        
        # Prepare result with all necessary data for duplicate checking
        result = {
            "report_id": report.get("report_id", "unknown"),
            "accept": True,
            "status": "accepted",
            "category": category,
            "confidence": round(confidence, 2),  # Add confidence to response
            "urgency": urgency,
            "reason": "Report accepted successfully",
            # Store data needed for duplicate checking
            "user_id": user_id,
            "description": description,
            "latitude": latitude,
            "longitude": longitude
        }
        
        # Compute and store image hash if image is provided
        image_bytes = report.get("image_bytes")
        if image_bytes:
            try:
                from PIL import Image
                import imagehash
                import io
                img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                img_hash = imagehash.phash(img)
                result["image_hash"] = str(img_hash)  # Store as string for JSON serialization
            except Exception as e:
                print(f"[WARNING] Failed to compute image hash (non-critical): {str(e)}")
                # Continue without image hash

        # Save to dataset (this is how we "store" for future duplicate checks)
        # Remove image_bytes from report data before saving (can't serialize bytes to JSON)
        report_for_save = {**report, **result}
        if "image_bytes" in report_for_save:
            # Remove image_bytes - we only need image_hash for duplicate checking
            del report_for_save["image_bytes"]
        
        try:
            dataset.save_report(report_for_save)
            print(f"[DEBUG] Successfully saved accepted report to dataset")
        except Exception as e:
            print(f"[ERROR] Failed to save report to dataset (non-critical): {str(e)}")
            import traceback
            print(traceback.format_exc())
            # Continue - dataset save failure shouldn't block acceptance
        
        return result

    except Exception as e:
        print(f"[ERROR] Critical error in classify_report: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return reject(report, f"Processing error: {str(e)}", confidence=0.0)


# ------------------------------------
# Image validation logic (BALANCED) - FROM BYTES
# ------------------------------------
def image_matches_category_from_bytes(image_bytes: bytes, category: str) -> bool:
    """
    Check if image matches the detected category.
    Works with image bytes directly (no URL required).
    Returns True if image matches or if classification is uncertain (allow through).
    Returns False ONLY if we can confidently determine the image doesn't match.
    """
    try:
        image_label = ic.classify_image_from_bytes(image_bytes)
        image_label = str(image_label).lower().strip() if image_label else "other"
        
        print(f"[DEBUG] Image classified as: '{image_label}' for category '{category}'")
        
        # If classifier completely fails or returns empty, allow through (uncertain)
        if not image_label or image_label == "":
            print(f"[DEBUG] Image classification returned empty - allowing through (uncertain)")
            return True  # Allow through if classification fails
        
        # Get allowed labels and keywords for this category
        allowed_labels = [lbl.lower() for lbl in IMAGE_TO_CATEGORY_MAP.get(category, [])]
        category_keywords = [kw.lower() for kw in CATEGORY_KEYWORDS.get(category, [])]

        # If "other" - classification uncertain, allow through (don't reject uncertain cases)
        if image_label == "other":
            print(f"[DEBUG] Image classified as 'other' - allowing through (uncertain classification)")
            return True  # Allow through - don't reject uncertain classifications

        # If generic label, allow through (too vague to confidently reject)
        if image_label in GENERIC_IMAGE_LABELS:
            print(f"[DEBUG] Image classified as generic '{image_label}' - allowing through (uncertain)")
            return True  # Allow through - generic labels are too vague to reject

        # Method 1: Direct exact match with allowed labels
        if image_label in allowed_labels:
            print(f"Image label '{image_label}' exactly matches category '{category}' - accepting")
            return True

        # Method 2: Check if image label contains any allowed label (substring match)
        for lbl in allowed_labels:
            if lbl in image_label or image_label in lbl:
                print(f"Image label '{image_label}' contains allowed label '{lbl}' for category '{category}' - accepting")
                return True

        # Method 3: Check if image label contains any category keyword from description
        for kw in category_keywords:
            if kw in image_label or image_label in kw:
                print(f"Image label '{image_label}' matches keyword '{kw}' for category '{category}' - accepting")
                return True

        # Method 4: Word-level matching (split and check for common words)
        image_words = set(image_label.split())
        for lbl in allowed_labels:
            lbl_words = set(lbl.split())
            common_words = image_words.intersection(lbl_words)
            if common_words and len(common_words) > 0:
                print(f"Image label '{image_label}' shares words with '{lbl}' for category '{category}' - accepting")
                return True

        # Method 5: Check if any word from image appears in category keywords
        for word in image_words:
            if len(word) > 2:  # Only check meaningful words (length > 2)
                for kw in category_keywords:
                    if word in kw or kw in word:
                        print(f"Image word '{word}' matches keyword '{kw}' for category '{category}' - accepting")
                        return True
                for lbl in allowed_labels:
                    if word in lbl or lbl in word:
                        print(f"Image word '{word}' matches label '{lbl}' for category '{category}' - accepting")
                        return True

        # If no validation rules for this category, allow through (can't validate)
        if not allowed_labels and not category_keywords:
            print(f"[DEBUG] No validation rules for category '{category}' - allowing through")
            return True  # Allow through if we can't validate

        # If none of the methods match and we have validation rules, reject
        # Only reject if we have clear validation rules and can confidently say it doesn't match
        if allowed_labels or category_keywords:
            print(f"[DEBUG] Image label '{image_label}' does NOT match category '{category}' - rejecting")
            return False  # Reject only if we have validation rules and it clearly doesn't match

        # If no validation rules, allow through
        print(f"[DEBUG] No clear match but no validation rules - allowing through")
        return True

    except Exception as e:
        # If classification fails completely, allow through (don't block on technical errors)
        print(f"[DEBUG] Image classification error for category '{category}' - allowing through (technical error): {str(e)}")
        import traceback
        print(traceback.format_exc())
        return True  # Allow through if classification fails (technical error)


# ------------------------------------
# Reject helper
# ------------------------------------
def reject(report, reason, category="Other", confidence=0.0):
    result = {
        "report_id": report.get("report_id", "unknown"),
        "accept": False,
        "status": "rejected",
        "category": category,
        "confidence": round(confidence, 2),  # Include confidence in rejection
        "reason": reason
    }
    # Remove image_bytes from report data before saving (can't serialize bytes to JSON)
    report_for_save = {**report, **result}
    if "image_bytes" in report_for_save:
        # Remove image_bytes - we only need image_hash for duplicate checking
        del report_for_save["image_bytes"]
    
    try:
        dataset.save_report(report_for_save)
        print(f"[DEBUG] Successfully saved rejected report to dataset")
    except Exception as e:
        print(f"[ERROR] Failed to save rejected report to dataset (non-critical): {str(e)}")
        import traceback
        print(traceback.format_exc())
        # Continue - dataset save failure shouldn't block rejection response
    return result
