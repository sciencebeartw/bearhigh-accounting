#!/usr/bin/env python3
"""Extract a local-only normalized import snapshot from the high workbook.

The output can contain student names, phone numbers, and tuition details.
Write it only to ignored local paths such as data/snapshots/ or
public/local-data/. Do not commit generated output.
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

from scan_workbook import (
    collect_header_map,
    index_to_col,
    parse_sheet,
    read_shared_strings,
    read_sheet_paths,
    row_values,
    text,
)


BASIC_FIELDS = {
    "國中": "juniorHigh",
    "年級": "grade",
    "高中": "highSchool",
    "姓名": "name",
    "學生手機": "studentPhone",
    "室內電話": "homePhone",
    "母手機": "motherPhone",
    "父手機": "fatherPhone",
    "身份證字號": "nationalId",
    "身分證字號": "nationalId",
    "生日": "birthday",
    "會考成績": "examScore",
    "成績公佈": "scorePublish",
    "姓名公佈": "namePublish",
}

TUITION_KEYWORDS = ("學收", "抵扣", "抵用", "優惠", "退費", "繳費日期", "學費備註")
TEACHER_FIELD_HEADERS = ("學校", "姓名", "收費", "檢核", "單堂", "異動", "備註")
NON_COURSE_HEADERS = (
    "學收",
    "抵扣",
    "抵用",
    "優惠",
    "總學收",
    "進度總學收",
    "退費",
    "繳費",
    "備註",
    "公佈",
    "姓名",
    "手機",
    "電話",
    "身份證",
    "身分證",
    "生日",
    "國中",
    "高中",
    "年級",
)


def safe_key(value: str) -> str:
    return re.sub(r"[.#$\[\]/\s]+", "-", value.strip()).strip("-")


def is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value == 1
    rendered = text(value).lower()
    return rendered in {"true", "yes", "y", "1", "✓", "v"}


def is_zeroish(value: Any) -> bool:
    if value in (None, ""):
        return True
    if isinstance(value, bool):
        return value is False
    if isinstance(value, (int, float)):
        return value == 0
    rendered = text(value)
    return rendered in {"", "0", "FALSE", "false"}


def is_student_sheet(values: dict[tuple[int, int], Any], max_col: int) -> bool:
    row1 = " ".join(text(value) for _, value in row_values(values, 1, max_col))
    row3 = " ".join(text(value) for _, value in row_values(values, 3, max_col))
    return "基本資料" in row1 and "姓名" in row3


def row_has_marker(values: dict[tuple[int, int], Any], row: int, max_col: int) -> bool:
    row_text = " ".join(text(value) for _, value in row_values(values, row, max_col))
    return "總人數" in row_text or "尾列不計入" in row_text


def course_like_header(header: str) -> bool:
    if not header:
        return False
    return not any(keyword in header for keyword in NON_COURSE_HEADERS)


def classify_tuition_header(header: str) -> str:
    if "退費" in header:
        return "refund"
    if "抵扣" in header or "抵用" in header or "優惠" in header:
        return "discount_or_voucher"
    if "繳費日期" in header:
        return "payment_date"
    if "備註" in header:
        return "note"
    if "學收" in header:
        return "tuition"
    return "other"


def extract_student_sheet(
    sheet_name: str,
    values: dict[tuple[int, int], Any],
    *,
    max_row: int,
    max_col: int,
) -> dict[str, Any]:
    group_headers = collect_header_map(values, 1, max_col)
    headers = collect_header_map(values, 3, max_col)
    students: list[dict[str, Any]] = []
    tuition_entries: list[dict[str, Any]] = []
    selected_courses_total = 0

    for row in range(4, max_row + 1):
        if row_has_marker(values, row, max_col):
            continue

        row_by_header = {
            header: values[(row, col)]
            for col, header in headers.items()
            if (row, col) in values
        }
        name = text(row_by_header.get("姓名", ""))
        if not name:
            continue

        student_id = safe_key(f"{sheet_name}-{row}-{name}")
        profile = {
            BASIC_FIELDS[header]: text(value)
            for header, value in row_by_header.items()
            if header in BASIC_FIELDS and not is_zeroish(value)
        }

        selected_courses: list[dict[str, Any]] = []
        for col, header in headers.items():
            if not course_like_header(header):
                continue
            value = values.get((row, col))
            if not is_truthy(value):
                continue
            selected_courses.append(
                {
                    "column": index_to_col(col),
                    "header": header,
                    "group": group_headers.get(col, ""),
                }
            )

        for col, header in headers.items():
            if not any(keyword in header for keyword in TUITION_KEYWORDS):
                continue
            value = values.get((row, col))
            if is_zeroish(value):
                continue
            tuition_entries.append(
                {
                    "studentId": student_id,
                    "studentName": name,
                    "sheet": sheet_name,
                    "row": row,
                    "column": index_to_col(col),
                    "header": header,
                    "group": group_headers.get(col, ""),
                    "kind": classify_tuition_header(header),
                    "value": text(value),
                }
            )

        selected_courses_total += len(selected_courses)
        students.append(
            {
                "id": student_id,
                "sheet": sheet_name,
                "row": row,
                "profile": profile,
                "selectedCourses": selected_courses,
            }
        )

    summary = {
        "sheet": sheet_name,
        "studentCount": len(students),
        "selectedCourseCount": selected_courses_total,
        "tuitionEntryCount": len(tuition_entries),
        "rowsWithTuitionEntries": len({entry["studentId"] for entry in tuition_entries}),
        "tuitionEntryKinds": {},
    }
    for entry in tuition_entries:
        summary["tuitionEntryKinds"][entry["kind"]] = summary["tuitionEntryKinds"].get(entry["kind"], 0) + 1

    return {
        "summary": summary,
        "students": students,
        "tuitionEntries": tuition_entries,
    }


def row_text(values: dict[tuple[int, int], Any], row: int, max_col: int) -> str:
    return " ".join(text(value) for _, value in row_values(values, row, max_col))


def extract_block_title(values: dict[tuple[int, int], Any], row: int, start_col: int, max_col: int) -> str:
    for title_row in range(max(1, row - 2), row):
        for col in range(start_col, min(max_col, start_col + 10) + 1):
            rendered = text(values.get((title_row, col), ""))
            if rendered and rendered not in TEACHER_FIELD_HEADERS:
                return rendered
    return ""


def extract_teacher_roster_blocks(
    sheet_name: str,
    values: dict[tuple[int, int], Any],
    *,
    max_row: int,
    max_col: int,
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    field_rows: list[tuple[int, int]] = []

    for row in range(1, max_row + 1):
        cells = dict(row_values(values, row, max_col))
        school_cols = [col for col, value in cells.items() if text(value) == "學校"]
        for start_col in school_cols:
            nearby = " ".join(text(cells.get(col, "")) for col in range(start_col, min(max_col, start_col + 10) + 1))
            if "姓名" in nearby:
                field_rows.append((row, start_col))

    for field_row, start_col in field_rows:
        headers: dict[int, str] = {}
        for col in range(start_col, min(max_col, start_col + 12) + 1):
            rendered = text(values.get((field_row, col), ""))
            if rendered:
                headers[col] = rendered
        if "姓名" not in headers.values():
            continue

        name_col = next(col for col, header in headers.items() if header == "姓名")
        rows: list[dict[str, Any]] = []
        empty_streak = 0
        for row in range(field_row + 1, max_row + 1):
            if any(other_row == row for other_row, _ in field_rows):
                break
            row_cells = {
                header: text(values.get((row, col), ""))
                for col, header in headers.items()
                if not is_zeroish(values.get((row, col)))
            }
            if not row_cells:
                empty_streak += 1
                if empty_streak >= 10:
                    break
                continue
            empty_streak = 0
            name = text(values.get((row, name_col), ""))
            if not name or name in {"姓名", "總計"}:
                continue
            rows.append({"row": row, "fields": row_cells})

        blocks.append(
            {
                "sheet": sheet_name,
                "title": extract_block_title(values, field_row, start_col, max_col),
                "headerRow": field_row,
                "startColumn": index_to_col(start_col),
                "headers": [headers[col] for col in sorted(headers)],
                "rowCount": len(rows),
                "rows": rows,
            }
        )

    return blocks


def extract_teacher_payroll_blocks(
    sheet_name: str,
    values: dict[tuple[int, int], Any],
    *,
    max_row: int,
    max_col: int,
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    title_cells: list[tuple[int, int, str]] = []
    for row in range(1, max_row + 1):
        for col, value in row_values(values, row, max_col):
            rendered = text(value)
            if "堂數" in rendered and ("年" in rendered or "月" in rendered):
                title_cells.append((row, col, rendered))

    for title_row, start_col, title in title_cells:
        rows: list[dict[str, Any]] = []
        empty_streak = 0
        end_col = min(max_col, start_col + 9)
        for row in range(title_row + 1, max_row + 1):
            cells = [
                {"column": index_to_col(col), "value": text(values.get((row, col), ""))}
                for col in range(start_col, end_col + 1)
                if not is_zeroish(values.get((row, col)))
            ]
            if not cells:
                empty_streak += 1
                if empty_streak >= 5:
                    break
                continue
            empty_streak = 0
            rows.append({"row": row, "cells": cells})
            if len(rows) >= 80:
                break

        blocks.append(
            {
                "sheet": sheet_name,
                "title": title,
                "titleRow": title_row,
                "startColumn": index_to_col(start_col),
                "rowCount": len(rows),
                "rows": rows,
            }
        )

    return blocks


def extract_teacher_sheet(
    sheet_name: str,
    values: dict[tuple[int, int], Any],
    *,
    max_row: int,
    max_col: int,
) -> dict[str, Any]:
    roster_blocks = extract_teacher_roster_blocks(sheet_name, values, max_row=max_row, max_col=max_col)
    payroll_blocks = extract_teacher_payroll_blocks(sheet_name, values, max_row=max_row, max_col=max_col)
    return {
        "summary": {
            "sheet": sheet_name,
            "rosterBlockCount": len(roster_blocks),
            "rosterRowCount": sum(block["rowCount"] for block in roster_blocks),
            "payrollBlockCount": len(payroll_blocks),
            "payrollRowCount": sum(block["rowCount"] for block in payroll_blocks),
        },
        "rosterBlocks": roster_blocks,
        "payrollBlocks": payroll_blocks,
    }


def extract_workbook(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = read_shared_strings(zf)
        student_sheets = []
        teacher_sheets = []
        for sheet_name, sheet_path in read_sheet_paths(zf):
            values = parse_sheet(zf, sheet_path, shared_strings)
            max_row = max((row for row, _ in values), default=0)
            max_col = max((col for _, col in values), default=0)
            if is_student_sheet(values, max_col):
                student_sheets.append(
                    extract_student_sheet(sheet_name, values, max_row=max_row, max_col=max_col)
                )
            else:
                teacher_sheets.append(
                    extract_teacher_sheet(sheet_name, values, max_row=max_row, max_col=max_col)
                )

    students = [student for sheet in student_sheets for student in sheet["students"]]
    tuition_entries = [entry for sheet in student_sheets for entry in sheet["tuitionEntries"]]
    teacher_roster_blocks = [block for sheet in teacher_sheets for block in sheet["rosterBlocks"]]
    teacher_payroll_blocks = [block for sheet in teacher_sheets for block in sheet["payrollBlocks"]]
    return {
        "version": 1,
        "source": str(path),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "studentSheetCount": len(student_sheets),
            "teacherSheetCount": len(teacher_sheets),
            "studentCount": len(students),
            "tuitionEntryCount": len(tuition_entries),
            "teacherRosterBlockCount": len(teacher_roster_blocks),
            "teacherRosterRowCount": sum(block["rowCount"] for block in teacher_roster_blocks),
            "teacherPayrollBlockCount": len(teacher_payroll_blocks),
            "teacherPayrollRowCount": sum(block["rowCount"] for block in teacher_payroll_blocks),
            "sheets": [sheet["summary"] for sheet in student_sheets],
            "teacherSheets": [sheet["summary"] for sheet in teacher_sheets],
        },
        "students": students,
        "tuitionEntries": tuition_entries,
        "teacherSheets": teacher_sheets,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract local-only high accounting import data.")
    parser.add_argument("--input", required=True, help="Path to exported .xlsx snapshot.")
    parser.add_argument("--output", required=True, help="Path to write full local JSON.")
    parser.add_argument("--summary-output", help="Path to write redacted summary JSON.")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 2

    payload = extract_workbook(input_path)
    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output_path}")

    if args.summary_output:
        summary_path = Path(args.summary_output).expanduser().resolve()
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(
            json.dumps(
                {
                    "version": payload["version"],
                    "source": payload["source"],
                    "generatedAt": payload["generatedAt"],
                    "summary": payload["summary"],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {summary_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
