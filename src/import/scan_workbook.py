#!/usr/bin/env python3
"""Scan exported Numbers/Excel workbook structure for high accounting dry-runs.

The scanner intentionally produces a structural report, not a full data dump.
Sensitive student/person fields are redacted in row previews.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

TUITION_KEYWORDS = ("學收", "繳費", "退費", "抵扣", "優惠", "總學收", "學費備註")
SENSITIVE_HEADERS = ("姓名", "手機", "電話", "身份證", "身分證", "生日")
SECTION_KEYWORDS = (
    "學年度",
    "高一",
    "高二",
    "高三",
    "學測",
    "分科",
    "堂數",
    "師資",
    "數學",
    "英文",
    "物理",
    "化學",
    "國文",
    "社會",
)


def col_to_index(col: str) -> int:
    value = 0
    for ch in col:
        value = value * 26 + (ord(ch) - ord("A") + 1)
    return value


def index_to_col(index: int) -> str:
    parts: list[str] = []
    while index:
        index, rem = divmod(index - 1, 26)
        parts.append(chr(ord("A") + rem))
    return "".join(reversed(parts))


def split_ref(ref: str) -> tuple[str, int]:
    match = re.match(r"^([A-Z]+)(\d+)$", ref)
    if not match:
        raise ValueError(f"Unsupported cell ref: {ref}")
    return match.group(1), int(match.group(2))


def read_xml(zf: zipfile.ZipFile, path: str) -> ET.Element:
    return ET.fromstring(zf.read(path))


def read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = read_xml(zf, "xl/sharedStrings.xml")
    strings: list[str] = []
    for si in root.findall("main:si", NS):
        parts = [text.text or "" for text in si.findall(".//main:t", NS)]
        strings.append("".join(parts))
    return strings


def read_sheet_paths(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = read_xml(zf, "xl/workbook.xml")
    rels = read_xml(zf, "xl/_rels/workbook.xml.rels")
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("pkgrel:Relationship", NS)
    }

    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib["name"]
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = rel_targets[rel_id]
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        sheets.append((name, target))
    return sheets


def cell_value(cell: ET.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    value_el = cell.find("main:v", NS)
    inline = cell.find("main:is/main:t", NS)

    if cell_type == "inlineStr":
        return inline.text if inline is not None else ""
    if value_el is None:
        return None

    raw = value_el.text or ""
    if cell_type == "s":
        try:
            return shared_strings[int(raw)]
        except (ValueError, IndexError):
            return raw
    if cell_type == "b":
        return raw == "1"
    if cell_type in {"str", "e"}:
        return raw

    try:
        number = float(raw)
    except ValueError:
        return raw
    if number.is_integer():
        return int(number)
    return number


def parse_sheet(zf: zipfile.ZipFile, path: str, shared_strings: list[str]) -> dict[tuple[int, int], Any]:
    root = read_xml(zf, path)
    values: dict[tuple[int, int], Any] = {}
    for cell in root.findall(".//main:c", NS):
        ref = cell.attrib.get("r")
        if not ref:
            continue
        col, row = split_ref(ref)
        value = cell_value(cell, shared_strings)
        if value not in (None, ""):
            values[(row, col_to_index(col))] = value
    return values


def row_values(values: dict[tuple[int, int], Any], row: int, max_col: int) -> list[tuple[int, Any]]:
    return [(col, values[(row, col)]) for col in range(1, max_col + 1) if (row, col) in values]


def text(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    return str(value).replace("\n", " / ").strip()


def is_sensitive_column(headers: dict[int, str], col: int) -> bool:
    header = headers.get(col, "")
    return any(keyword in header for keyword in SENSITIVE_HEADERS)


def redact_value(headers: dict[int, str], col: int, value: Any, *, structural_row: bool = False) -> str:
    if not structural_row and is_sensitive_column(headers, col):
        return "[REDACTED]"
    rendered = text(value)
    if len(rendered) > 80:
        rendered = f"{rendered[:77]}..."
    return rendered


def collect_header_map(values: dict[tuple[int, int], Any], row: int, max_col: int) -> dict[int, str]:
    return {
        col: text(value)
        for col, value in row_values(values, row, max_col)
        if text(value)
    }


def classify_sheet(values: dict[tuple[int, int], Any], max_col: int) -> str:
    row1 = " ".join(text(value) for _, value in row_values(values, 1, max_col))
    row3 = " ".join(text(value) for _, value in row_values(values, 3, max_col))
    if "基本資料" in row1 and "姓名" in row3:
        return "student_tuition"
    return "teacher_or_reference"


def summarize_student_sheet(values: dict[tuple[int, int], Any], max_row: int, max_col: int) -> dict[str, Any]:
    row1 = collect_header_map(values, 1, max_col)
    row3 = collect_header_map(values, 3, max_col)
    tuition_headers = [
        {"column": index_to_col(col), "header": header}
        for col, header in row3.items()
        if any(keyword in header for keyword in TUITION_KEYWORDS)
    ]

    tail_rows: list[dict[str, Any]] = []
    for row in range(1, max_row + 1):
        row_text = " ".join(text(value) for _, value in row_values(values, row, max_col))
        if "尾列不計入" not in row_text and "總人數" not in row_text:
            continue
        headers = row3
        structural_row = "尾列不計入" in row_text or "總人數" in row_text
        cells = [
            {
                "column": index_to_col(col),
                "value": redact_value(headers, col, value, structural_row=structural_row),
            }
            for col, value in row_values(values, row, max_col)
        ]
        tail_rows.append({"row": row, "cells": cells})

    return {
        "groupHeaders": [
            {"column": index_to_col(col), "header": header}
            for col, header in row1.items()
        ],
        "columnHeaders": [
            {"column": index_to_col(col), "header": header}
            for col, header in row3.items()
        ],
        "tuitionHeaders": tuition_headers,
        "tailRows": tail_rows,
    }


def summarize_teacher_sheet(values: dict[tuple[int, int], Any], max_row: int, max_col: int) -> dict[str, Any]:
    section_rows: list[dict[str, Any]] = []
    field_rows: list[dict[str, Any]] = []
    scan_max_row = min(max_row, 120)

    for row in range(1, scan_max_row + 1):
        cells = row_values(values, row, max_col)
        if not cells:
            continue
        rendered_cells = [
            {"column": index_to_col(col), "value": text(value)}
            for col, value in cells
            if len(text(value)) <= 80
        ]
        row_text = " ".join(cell["value"] for cell in rendered_cells)
        if any(keyword in row_text for keyword in SECTION_KEYWORDS):
            section_rows.append({"row": row, "cells": rendered_cells[:12]})
        if "學校" in row_text and "姓名" in row_text:
            field_rows.append({"row": row, "cells": rendered_cells[:16]})

    return {
        "sectionRows": section_rows[:30],
        "fieldRows": field_rows[:12],
    }


def summarize_sheet(name: str, values: dict[tuple[int, int], Any]) -> dict[str, Any]:
    max_row = max((row for row, _ in values), default=0)
    max_col = max((col for _, col in values), default=0)
    kind = classify_sheet(values, max_col)
    summary: dict[str, Any] = {
        "name": name,
        "kind": kind,
        "maxRow": max_row,
        "maxColumn": max_col,
        "nonEmptyCells": len(values),
    }
    if kind == "student_tuition":
        summary.update(summarize_student_sheet(values, max_row, max_col))
    else:
        summary.update(summarize_teacher_sheet(values, max_row, max_col))
    return summary


def scan_workbook(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = read_shared_strings(zf)
        sheets = []
        for name, sheet_path in read_sheet_paths(zf):
            values = parse_sheet(zf, sheet_path, shared_strings)
            sheets.append(summarize_sheet(name, values))

    return {
        "source": str(path),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sheetCount": len(sheets),
        "sheets": sheets,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan high accounting workbook structure.")
    parser.add_argument("--input", required=True, help="Path to exported .xlsx snapshot.")
    parser.add_argument("--output", help="Path to write JSON report.")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 2

    report = scan_workbook(input_path)
    payload = json.dumps(report, ensure_ascii=False, indent=2)

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload + "\n", encoding="utf-8")
        print(f"Wrote {output_path}")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
