#!/usr/bin/env python3
"""Build an ignored Firebase RTDB update payload from the local import snapshot."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def safe_key(value: str) -> str:
    return re.sub(r"[.#$\[\]/\s]+", "-", value.strip()).strip("-")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build BearHigh accounting Firebase import payload.")
    parser.add_argument("--input", required=True, help="Path to local numbers_import_latest.json.")
    parser.add_argument("--output", required=True, help="Ignored JSON path to write for firebase database:update.")
    parser.add_argument("--batch-id", help="Import batch id. Defaults to timestamp.")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    payload: dict[str, Any] = json.loads(input_path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    batch_id = safe_key(args.batch_id or f"numbers-{now.strftime('%Y%m%d-%H%M%S')}")

    payload["cloudImport"] = {
        "batchId": batch_id,
        "importedAt": now.isoformat(),
        "sourceFileName": Path(str(payload.get("source", input_path.name))).name,
    }
    payload.pop("source", None)

    update_payload = {
        "currentImportBatchId": batch_id,
        "importBatches": {
            batch_id: payload,
        },
    }

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(update_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(output_path),
        "batchId": batch_id,
        "studentCount": payload.get("summary", {}).get("studentCount", 0),
        "tuitionEntryCount": payload.get("summary", {}).get("tuitionEntryCount", 0),
        "teacherPayrollRowCount": payload.get("summary", {}).get("teacherPayrollRowCount", 0),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
