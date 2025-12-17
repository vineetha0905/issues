#!/usr/bin/env python3
"""
Debug script to test profanity detection
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Test import
print("=" * 60)
print("Testing Profanity-Check Import")
print("=" * 60)

try:
    from profanity_check import predict
    print("✅ Successfully imported profanity_check.predict")
    
    # Test with clean text
    print("\nTesting with clean text: 'This is a clean sentence'")
    result_clean = predict(["This is a clean sentence"])
    print(f"Result: {result_clean}")
    print(f"Type: {type(result_clean)}")
    if hasattr(result_clean, '__getitem__'):
        print(f"Value: {result_clean[0]}")
        print(f"Is profane: {bool(int(result_clean[0]) == 1)}")
    
    # Test with profane text
    print("\nTesting with profane text: 'This is a fucking pothole'")
    result_profane = predict(["This is a fucking pothole"])
    print(f"Result: {result_profane}")
    print(f"Type: {type(result_profane)}")
    if hasattr(result_profane, '__getitem__'):
        print(f"Value: {result_profane[0]}")
        print(f"Is profane: {bool(int(result_profane[0]) == 1)}")
    
    # Test with more profane words
    test_cases = [
        "fuck",
        "shit",
        "bitch",
        "damn",
        "hell",
        "This is a clean description of a pothole",
        "fuck this pothole",
        "what the hell is wrong",
    ]
    
    print("\n" + "=" * 60)
    print("Testing Multiple Cases")
    print("=" * 60)
    
    for test_text in test_cases:
        result = predict([test_text])
        is_profane = bool(int(result[0]) == 1) if hasattr(result, '__getitem__') else bool(int(result) == 1)
        status = "PROFANE" if is_profane else "CLEAN"
        print(f"{status:8} | '{test_text}'")
    
except ImportError as e:
    print(f"❌ Failed to import profanity_check: {e}")
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

# Test the actual pipeline
print("\n" + "=" * 60)
print("Testing Pipeline Function")
print("=" * 60)

try:
    from app.pipeline import classify_report, PROFANITY_AVAILABLE, _profanity_predict
    
    print(f"PROFANITY_AVAILABLE: {PROFANITY_AVAILABLE}")
    print(f"_profanity_predict is None: {_profanity_predict is None}")
    
    # Test cases
    test_reports = [
        {
            "report_id": "test1",
            "description": "This is a fucking pothole",
            "category": "Road & Traffic",
            "user_id": "test"
        },
        {
            "report_id": "test2",
            "description": "There is a large pothole on Main Street",
            "category": "Road & Traffic",
            "user_id": "test"
        },
        {
            "report_id": "test3",
            "description": "What the hell is wrong with this road",
            "category": "Road & Traffic",
            "user_id": "test"
        },
    ]
    
    for report in test_reports:
        result = classify_report(report)
        status = result.get("status")
        reason = result.get("reason", "")
        print(f"\nDescription: '{report['description']}'")
        print(f"Status: {status}")
        if reason:
            print(f"Reason: {reason}")
        if status == "rejected" and "abusive" in reason.lower():
            print("✅ Profanity detected correctly!")
        elif status == "accepted" and any(word in report['description'].lower() for word in ["fuck", "hell"]):
            print("❌ Profanity NOT detected!")
            
except Exception as e:
    print(f"❌ Error testing pipeline: {e}")
    import traceback
    traceback.print_exc()
