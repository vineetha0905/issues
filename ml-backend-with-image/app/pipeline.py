from app import storage, dataset
from app import image_classifier as ic
import re

# Profanity detection
import warnings
# Suppress pkg_resources deprecation warnings globally (they're just warnings, not errors)
warnings.filterwarnings("ignore", category=UserWarning, message=".*pkg_resources.*")

PROFANITY_AVAILABLE = False
_profanity_predict = None
try:
    from profanity_check import predict as _profanity_predict
    # Test that it works with a known profane word
    _test_result = _profanity_predict(["fuck"])
    # Check if result is valid (should be numpy array or list with 1)
    if _test_result is not None:
        PROFANITY_AVAILABLE = True
except ImportError:
    # Library truly not installed
    pass  # Silently fall back to keyword-based detection
except Exception as e:
    # Any other import/runtime error - silently fall back
    PROFANITY_AVAILABLE = False
    _profanity_predict = None

# Category-scoped urgent keywords (same methodology as CATEGORY_KEYWORDS)
# Keep a Global bucket to preserve previous behavior while enabling per-category tuning
URGENT_KEYWORDS = {
    "Global": [
        # Road & Transport
        "accident", "collision", "roadblock", "traffic jam", "hit and run",
        "bridge collapse", "pothole accident", "road caved in",

        # Fire & Hazard
        "fire", "burning", "smoke", "blast", "explosion", "short circuit",
        "gas leak", "electric spark", "transformer burst",

        # Water & Flood
        "flood", "waterlogging", "sewage overflow", "pipe burst",
        "drain blocked", "heavy rain", "overflowing drain", "contaminated water",

        # Health & Sanitation
        "garbage overflow", "dead animal", "toxic smell", "mosquito breeding",
        "epidemic", "dengue outbreak", "cholera", "sanitation hazard",

        # Safety & Security
        "violence", "crime", "theft", "fight", "robbery", "public hazard",
        "building collapse", "wall collapse", "tree fallen", "landslide",

        # Other Civic Emergencies
        "power outage", "electric shock", "streetlight sparks",
        "ambulance needed", "emergency help"
    ],
    # Per-category overrides/extensions (can be expanded as needed)
    "Road & Traffic": ["accident", "collision", "roadblock", "pothole"],
    "Water & Drainage": ["flood", "waterlogging", "sewage overflow", "pipe burst"],
    "Electricity": ["power outage", "short circuit", "electric shock"],
    "Garbage & Sanitation": ["garbage overflow", "toxic smell"],
    "Street Lighting": ["streetlight sparks", "dark area"],
    "Public Safety": ["violence", "robbery", "fire"],
    "Parks & Recreation": ["tree fallen"],
    "Other": []
}


# optional model availability flags are handled inside image_classifier

def initialize_models():
    # initialize image classifier (CLIP) if available
    try:
        ic.initialize_clip()
    except Exception:
        pass

def classify_report(report: dict):
    desc = (report.get("description") or "").strip()
    desc_lower = desc.lower()
    cat = (report.get("category") or "").strip()

    # 1. Reject if abusive (using profanity-check library + keyword matching)
    # Comprehensive keyword list for abusive language detection
    # This is the PRIMARY detection method - ML model is secondary
    fallback_bad_words = {
        "fuck", "fucking", "fucked", "fucker", "fuckin", "fucks",
        "shit", "shitting", "shitted", "shitty", "shits",
        "bitch", "bitches", "bitching", "bitched",
        "bastard", "bastards",
        "asshole", "ass", "asses", "assholes",
        "dick", "dicks", "dickhead",
        "cunt", "cunts",
        "prick", "pricks",
        "slut", "sluts","bloody",
        "whore", "whores","rascal",
        "damn", "damned", "damnit", "dammit",
        "hell", "hells",
        "crap", "crappy",
        "piss", "pissed", "pissing",
        "idiot", "idiots", "idiotic",
        "stupid", "stupidity", "stupidly",
        "moron", "morons",
        "retard", "retarded",
        "gay", "gays",  # Context-dependent, but often used abusively
        "hate", "hateful", "hating"
    }
    
    # ALWAYS check keywords first (most reliable)
    # Check if any profane word appears in the description (case-insensitive substring match)
    is_profane_keywords = any(word in desc_lower for word in fallback_bad_words)
    
    # Also try ML model if available
    is_profane_ml = False
    if PROFANITY_AVAILABLE and _profanity_predict is not None:
        try:
            # profanity_check.predict returns a numpy array with 1 for profane, 0 for clean
            predictions = _profanity_predict([desc])
            # Handle numpy array, list, or scalar returns
            if hasattr(predictions, '__getitem__') and len(predictions) > 0:
                is_profane_ml = bool(int(predictions[0]) == 1)
            elif hasattr(predictions, 'item'):
                is_profane_ml = bool(int(predictions.item()) == 1)
            else:
                is_profane_ml = bool(int(predictions) == 1)
        except Exception:
            # If profanity_check fails at runtime, just use keyword check
            pass
    
    # Reject if EITHER detection method finds profanity
    is_profane = is_profane_keywords or is_profane_ml
    
    if is_profane:
        result = {
            "report_id": report["report_id"],
            "status": "rejected",
            "reason": "Abusive language detected"
        }
        dataset.save_report({**report, **result})
        return result

    # 2. Category consistency validation (description/image must relate to selected category)
    CATEGORY_KEYWORDS = {
        "Road & Traffic": [
            "pothole", "road", "street", "traffic", "signal", "accident", "jam", "footpath", "speed breaker", "crosswalk", "pavement", "highway", "bridge", "intersection"
        ],
        "Water & Drainage": [
            "drain", "drainage", "sewage", "sewer", "leak", "leaking", "leakage", "waterlogging", "pipe", "flood", "overflow", "water", "supply", "system", "blocked", "clogged"
        ],
        "Electricity": [
            "electric", "electricity", "power", "outage", "wire", "transformer", "short circuit", "shock", "cable", "meter", "electrical", "voltage", "current"
        ],
        "Garbage & Sanitation": [
            "garbage", "trash", "waste", "bin", "dump", "sanitation", "dirty", "sewage", "overflow", "cleanliness", "collection", "disposal", "rubbish", "litter"
        ],
        "Street Lighting": [
            "street light", "streetlight", "lamp", "bulb", "pole", "light not working", "dark", "lighting", "illumination", "street lamp", "electric pole", "night light", "dim", "flickering"
        ],
        "Public Safety": [
            "crime", "robbery", "theft", "violence", "fire", "hazard", "danger", "safety", "harassment", "emergency", "accident", "security", "threat", "risk"
        ],
        "Parks & Recreation": [
            "park", "garden", "playground", "tree", "bench", "grass", "lawn", "recreation", "green space", "playground equipment", "walking path", "fountain", "pond", "lake", "water", "flooded", "maintenance", "amenities"
        ],
        "Other": []
    }

    # Image labels allowed per category (same methodology: category -> labels)
    IMAGE_LABELS = {
        "Road & Traffic": ["pothole", "road", "traffic", "street", "footpath", "pavement", "speed breaker", "crosswalk", "damaged road", "illegal parking", "broken footpath", "traffic signal not working", "road accident"],
        "Garbage & Sanitation": ["garbage", "trash", "dump", "waste", "bin", "sanitation", "dirty", "sewage", "cleanliness", "dustbin", "garbage dump", "overflowing dustbin", "open drain", "sewage overflow", "dead animal", "toilet issue"],
        "Street Lighting": ["streetlight", "lamp", "bulb", "pole", "light", "electric pole", "street lamp", "lighting", "dark area", "electricity", "power", "streetlight not working", "fallen electric pole", "loose wire", "power outage"],
        "Water & Drainage": ["drain", "drainage", "sewage", "sewer", "leak", "leaking", "leakage", "pipe", "water", "overflow", "water supply", "drainage system", "waterlogging", "pipe burst", "no water supply", "drainage issue", "flood"],
        "Electricity": ["transformer", "wire", "meter", "electricity", "power", "electric", "cable", "short circuit", "shock"],
        "Public Safety": ["fire", "hazard", "danger", "safety", "emergency", "accident", "crime", "robbery", "theft", "violence", "harassment", "gas leak", "building collapse", "accident site"],
        "Parks & Recreation": ["park", "garden", "playground", "tree", "bench", "grass", "lawn", "recreation", "green space", "park area", "garden area", "tree fallen", "illegal construction", "park maintenance", "encroachment"],
        "Other": ["other"]
    }

    allowed_keywords = CATEGORY_KEYWORDS.get(cat, [])
    desc_match = True if cat == "Other" else any(k in desc_lower for k in allowed_keywords)

    image_url = report.get("image_url")
    image_cat = None
    if image_url:
        image_cat = ic.classify_image(image_url)
        labels_for_cat = [s.lower() for s in IMAGE_LABELS.get(cat, [])]
        image_label = str(image_cat).lower() if image_cat is not None else "other"
        
        # More flexible matching - check if any part of the image label matches
        image_match = (cat == "Other") or any(label in image_label or image_label in label for label in labels_for_cat)
        
        # Special cases for better matching
        if cat == "Parks & Recreation":
            # Accept images that contain park-related terms or water-related terms (for flooded parks)
            park_related = ["park", "garden", "playground", "tree", "bench", "grass", "lawn", "recreation", "green", "water", "flood", "pond", "lake"]
            image_match = any(term in image_label for term in park_related)
        elif cat == "Street Lighting":
            # Accept images that contain lighting-related terms
            lighting_related = ["streetlight", "lamp", "bulb", "pole", "light", "electric", "power", "dark", "illumination", "street", "night"]
            image_match = any(term in image_label for term in lighting_related)
    else:
        image_match = False

    has_image = bool(image_url)
    # If an image is provided and clearly contradicts the category *and*
    # the description also doesn't match, then reject. If the description
    # is fine, don't punish the user for a weak/ambiguous image classifier.
    if has_image and not image_match and not desc_match:
        result = {
            "report_id": report["report_id"],
            "status": "rejected",
            "reason": "image/description not clearly related to category"
        }
        dataset.save_report({**report, **result})
        return result

    valid_for_category = (desc_match or image_match) if has_image else desc_match

    if not valid_for_category:
        reason_parts = []
        if not desc_match:
            reason_parts.append("description not related to category")
        reason = ", ".join(reason_parts) or "not related to category"
        result = {
            "report_id": report["report_id"],
            "status": "rejected",
            "reason": reason
        }
        dataset.save_report({**report, **result})
        return result

    # 3. Reject if duplicate (spam)
    if storage.is_duplicate(report.get("user_id"), desc, cat):
        result = {
            "report_id": report["report_id"],
            "status": "rejected",
            "reason": "Duplicate spam"
        }
        dataset.save_report({**report, **result})
        return result
    # 3b. Reject image duplicate using pHash
    if image_url and storage.is_duplicate_image(image_url):
        result = {
            "report_id": report["report_id"],
            "status": "rejected",
            "reason": "Duplicate spam (image)"
        }
        dataset.save_report({**report, **result})
        return result

    # 4. Reject location duplicate (same text+category within threshold meters)
    lat = report.get("latitude")
    lon = report.get("longitude")
    if lat is not None and lon is not None:
        if storage.is_duplicate_location(lat, lon, desc, cat):
            result = {
                "report_id": report["report_id"],
                "status": "rejected",
                "reason": "Duplicate spam (location)"
            }
            dataset.save_report({**report, **result})
            return result

    # 5. Priority (urgent vs normal) using keywords (category-scoped + global)
    urgent_words = [
        *(URGENT_KEYWORDS.get(cat, [])),
        *(URGENT_KEYWORDS.get("Global", []))
    ]
    is_urgent = any(word in desc_lower for word in urgent_words)
    priority = "urgent" if is_urgent else "normal"

    # 6. Image classification (if image provided and not already classified)
    if image_url and image_cat is None:
        image_cat = ic.classify_image(image_url)
    
    result = {
        "report_id": report["report_id"],
        "status": "accepted",
        "priority": priority,
        "category": cat,
        "text_category": cat,
        "image_category": image_cat
    }
    dataset.save_report({**report, **result})
    return result
