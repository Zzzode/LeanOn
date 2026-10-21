"""Compare actual synthetic core/iOS/Android transactions, not UI acceptance."""

import argparse
import json
from pathlib import Path

FIELDS = (
    "schemaVersion", "revision", "setupCompleted", "profile", "goalWeightKg",
    "weeklyLossKg", "guidanceMode", "safetyFlags", "weights", "water",
    "exercises", "intake", "intakeEntries", "legacyIntake", "deletedRecords",
    "processedOperations",
)


def normalize(value):
    if isinstance(value, float):
        return round(value, 9)
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize(item) for item in value]
    return value


def snapshot(row):
    state = row.get("state") or row.get("hostData") or row["response"]["hostData"]
    result = {key: normalize(state[key]) for key in FIELDS}
    # Entity arrays have no contractual display order; receipts retain commit order.
    for key in ("weights", "water", "exercises", "intakeEntries", "legacyIntake"):
        result[key] = sorted(result[key], key=lambda item: item["id"])
    result["intake"] = sorted(result["intake"], key=lambda item: item["date"])
    result["deletedRecords"] = sorted(result["deletedRecords"], key=lambda item: item["token"])
    return result


def response(row):
    result = row.get("result") or row.get("response") or row
    return {key: result.get(key) for key in ("appliedRevision", "replayed", "undoToken")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-dir", type=Path, default=Path("/tmp"))
    evidence_dir = parser.parse_args().evidence_dir
    sources = {
        platform: json.loads((evidence_dir / f"leanon-daily-{platform}-conformance.json").read_text())
        for platform in ("core", "ios", "android")
    }
    reference = sources["core"]
    for platform, actual in sources.items():
        assert len(actual["operations"]) == 10, platform
        assert len(actual["rejections"]) == 3, platform
        for index, (expected, observed) in enumerate(zip(reference["operations"], actual["operations"])):
            assert snapshot(expected) == snapshot(observed), (platform, "snapshot", index)
            assert response(expected) == response(observed), (platform, "response", index)
        for index, (expected, observed) in enumerate(zip(reference["rejections"], actual["rejections"])):
            assert expected["code"] == observed["code"], (platform, "rejection", index)
            assert snapshot(expected) == snapshot(observed), (platform, "unchanged state", index)
        print(f"{platform}: 10 complete transaction snapshots and 3 rejected unchanged snapshots match")
    print("PASS: all 16 schema fields, receipts, tombstones, stable IDs and result metadata agree")
    print("Evidence level: executed synthetic store transactions; no UI or provider acceptance implied")


if __name__ == "__main__":
    main()
