#!/usr/bin/env python3
"""
Test script to verify profanity detection is working correctly
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.pipeline import classify_report

def test_profanity_detection():
    """Test profanity detection with various abusive and clean texts"""
    print("🧪 Testing Profanity Detection")
    print("=" * 60)
    
    # Test cases: (description, should_be_rejected, test_name)
    test_cases = [
        # Abusive language - should be rejected
        ("This is a fucking pothole that needs fixing", True, "Explicit profanity"),
        ("What the hell is wrong with this road", True, "Mild profanity"),
        ("This shit needs to be fixed immediately", True, "Strong profanity"),
        ("You're an idiot for not fixing this", True, "Insult"),
        ("This is crap and needs attention", True, "Mild profanity"),
        
        # Clean language - should be accepted
        ("There is a large pothole on Main Street that needs repair", False, "Clean description"),
        ("The street light is not working properly", False, "Clean technical issue"),
        ("Water is leaking from the pipe", False, "Clean water issue"),
        ("Garbage is overflowing from the bin", False, "Clean sanitation issue"),
        ("Park maintenance is needed", False, "Clean maintenance request"),
        
        # Edge cases
        ("FUCK this pothole", True, "All caps profanity"),
        ("fuck this pothole", True, "Lowercase profanity"),
        ("F*ck this pothole", False, "Censored profanity (might pass)"),
        ("This is a damn good road", True, "Profanity in positive context"),
    ]
    
    passed = 0
    failed = 0
    
    for desc, should_reject, test_name in test_cases:
        report = {
            "report_id": f"test_{test_name.replace(' ', '_').lower()}",
            "description": desc,
            "category": "Road & Traffic",
            "user_id": "test_user",
            "image_url": None,
            "latitude": 12.9,
            "longitude": 77.6
        }
        
        result = classify_report(report)
        was_rejected = result.get("status") == "rejected"
        reason = result.get("reason", "")
        
        # Check if result matches expectation
        if was_rejected == should_reject:
            status = "✅ PASS"
            passed += 1
        else:
            status = "❌ FAIL"
            failed += 1
        
        print(f"\n{status} - {test_name}")
        print(f"  Description: \"{desc}\"")
        print(f"  Expected: {'REJECTED' if should_reject else 'ACCEPTED'}")
        print(f"  Got: {'REJECTED' if was_rejected else 'ACCEPTED'}")
        if was_rejected:
            print(f"  Reason: {reason}")
    
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    
    if failed == 0:
        print("✅ All profanity detection tests PASSED!")
    else:
        print(f"❌ {failed} test(s) FAILED - profanity detection needs improvement")
    
    return failed == 0

if __name__ == "__main__":
    success = test_profanity_detection()
    sys.exit(0 if success else 1)
