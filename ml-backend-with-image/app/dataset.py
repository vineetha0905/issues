import json
from pathlib import Path

# Always resolve the dataset path relative to this file so that it works
# no matter where the application is started from (repo root, service dir, etc.)
BASE_DIR = Path(__file__).resolve().parent.parent  # points to ml-backend-with-image/
DATA_FILE = BASE_DIR / "data" / "dataset.jsonl"
DATA_FILE.parent.mkdir(parents=True, exist_ok=True)


def save_report(report_dict: dict):
    """Append raw report to dataset.jsonl (build dataset dynamically)."""
    with DATA_FILE.open("a", encoding="utf8") as f:
        f.write(json.dumps(report_dict, ensure_ascii=False) + "\n")
