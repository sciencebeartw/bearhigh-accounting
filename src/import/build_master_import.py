#!/usr/bin/env python3
"""Convert a parsed Numbers snapshot into one scoped BearHigh RTDB update.

The generated JSON is a Firebase multi-location update relative to
``/accounting``.  It intentionally never replaces the whole accounting node.
Historical imported records that no longer exist in the current Numbers file
are archived or voided instead of deleted.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable


TAIPEI = timezone(timedelta(hours=8))
TOTAL_TUITION_RE = re.compile(r"總學收|進度總學收")
PAYROLL_TITLE_RE = re.compile(r"(20\d{2})年(\d{1,2})月\s*堂數")
IMPORTED_SOURCES = {"masterImport", "numbersImport"}


def safe_key(value: Any) -> str:
    return re.sub(r"[.#$/\[\]\x00-\x1f\x7f]", "-", str(value or "").strip())


def stable_id(prefix: str, parts: Iterable[Any]) -> str:
    body = "_".join(str(part).strip() for part in parts if str(part or "").strip())
    return f"{prefix}_{safe_key(body)[:120]}"


def parse_number(value: Any) -> float:
    text = str(value if value is not None else "").replace(",", "").strip()
    if not text or text.upper() in {"TRUE", "FALSE"}:
        return 0
    try:
        return float(text)
    except ValueError:
        return 0


def rounded_amount(value: Any) -> int:
    return round(parse_number(value))


def column_index(column: Any) -> int:
    total = 0
    for char in str(column or "").upper():
        if "A" <= char <= "Z":
            total = total * 26 + ord(char) - 64
    return total


def excel_date(value: Any) -> str:
    serial = parse_number(value)
    if serial < 20000 or serial > 80000:
        return ""
    date = datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=round(serial))
    return date.date().isoformat()


def canonical_subject(value: Any) -> str:
    text = str(value or "")
    if re.search(r"明軒|黃浩|竹中|竹北|竹女|李翔|數學", text):
        return "數學"
    if re.search(r"英文|小揚|小楊", text):
        return "英文"
    if "物理" in text:
        return "物理"
    if "化學" in text:
        return "化學"
    if "生物" in text:
        return "生物"
    if re.search(r"地科|地球", text):
        return "地科"
    if "國文" in text:
        return "國文"
    if re.search(r"社會|地理|歷史|公民", text):
        return "社會"
    if "自然" in text:
        return "自然"
    return re.sub(r"學收|課程|班", "", text).strip()


def infer_term(group: Any, cohort: Any) -> str:
    text = str(group or cohort or "").strip()
    year = re.search(r"(\d{3})\s*學年度", text)
    semester = ""
    if re.search(r"下學期|下期", text):
        semester = "下學期"
    elif re.search(r"上學期|暑期|上期", text):
        semester = "上學期"
    if year and semester:
        return f"{year.group(1)}學年度{semester}"
    if year:
        return f"{year.group(1)}學年度"
    return text or "未分學期"


def normalized_courses(student: dict[str, Any]) -> list[dict[str, Any]]:
    current_group = ""
    rows: list[dict[str, Any]] = []
    for course in student.get("selectedCourses") or []:
        current_group = str(course.get("group") or current_group)
        header = str(course.get("header") or "").strip()
        if not header:
            continue
        rows.append(
            {
                **course,
                "header": header,
                "normalizedGroup": current_group,
                "term": infer_term(current_group, student.get("sheet")),
                "subject": canonical_subject(header),
                "columnIndex": column_index(course.get("column")),
            }
        )
    return rows


def teacher_assignment_for_course(course_name: str, cohort: str = "", term: str = "") -> dict[str, str]:
    if re.search(r"學測.*生物|生物.*學測", course_name):
        return {"instructorName": "許昱", "payrollPayeeName": "周逸化學"}
    if re.search(r"學測.*(地科|地球)|(地科|地球).*學測", course_name):
        return {"instructorName": "昱維", "payrollPayeeName": "周逸化學"}
    if "周逸" in course_name or re.search(r"化學|生物|地科|地球", course_name):
        return {"instructorName": "周逸化學", "payrollPayeeName": "周逸化學"}
    if "粘立" in course_name or "物理" in course_name:
        return {"instructorName": "粘立物理", "payrollPayeeName": "粘立物理"}
    if re.search(r"小揚|小楊|英文", course_name):
        return {"instructorName": "小楊英文", "payrollPayeeName": "小楊英文"}
    if "竹中" in course_name and "數學" in course_name and "115學年度" in term:
        if re.search(r"112|高一", cohort):
            return {"instructorName": "黃浩數學", "payrollPayeeName": "黃浩數學"}
        if re.search(r"111|高二", cohort):
            return {"instructorName": "明軒數學", "payrollPayeeName": "明軒數學"}
    if "明軒" in course_name:
        return {"instructorName": "明軒數學", "payrollPayeeName": "明軒數學"}
    if "黃浩" in course_name:
        return {"instructorName": "黃浩數學", "payrollPayeeName": "黃浩數學"}
    if re.search(r"國文", course_name):
        return {"instructorName": "國文師資-黃道", "payrollPayeeName": "國文師資-黃道"}
    if re.search(r"社會|地理|歷史|公民", course_name):
        return {"instructorName": "蔣明社會", "payrollPayeeName": "蔣明社會"}
    return {"instructorName": "", "payrollPayeeName": ""}


def payroll_defaults_for_teacher(teacher_name: str) -> dict[str, Any]:
    if "明軒" in teacher_name:
        return {"payrollMode": "mingxuan", "baseRate": 4500, "threshold": 15, "extraPerStudent": 300}
    if re.search(r"國文|黃道", teacher_name):
        return {"payrollMode": "hourly", "hourlyRate": 800, "hoursPerSession": 3}
    return {"payrollMode": "per_head"}


def fee_course_score(fee: dict[str, Any], course: dict[str, Any]) -> tuple[int, int] | None:
    distance = column_index(fee.get("column")) - course["columnIndex"]
    if distance < 0 or distance > 12:
        return None
    fee_subject = canonical_subject(fee.get("header"))
    course_subject = course["subject"]
    if fee_subject == course_subject:
        return (0, distance)
    if fee_subject == "自然" and course_subject in {"物理", "化學", "生物", "地科", "自然"}:
        return (1, distance)
    return (2, distance)


def payment_date_for_fee(fee: dict[str, Any], entries: list[dict[str, Any]]) -> str:
    fee_column = column_index(fee.get("column"))
    totals = sorted(
        (entry for entry in entries if entry.get("kind") == "tuition" and TOTAL_TUITION_RE.search(str(entry.get("header") or ""))),
        key=lambda entry: column_index(entry.get("column")),
    )
    following_total = next((entry for entry in totals if column_index(entry.get("column")) > fee_column), None)
    if following_total:
        total_column = column_index(following_total.get("column"))
        next_fee_column = min(
            (
                column_index(entry.get("column"))
                for entry in entries
                if entry.get("kind") == "tuition"
                and not TOTAL_TUITION_RE.search(str(entry.get("header") or ""))
                and column_index(entry.get("column")) > total_column
            ),
            default=10**9,
        )
        dates = [
            excel_date(entry.get("value"))
            for entry in entries
            if entry.get("kind") == "payment_date"
            and total_column < column_index(entry.get("column")) < next_fee_column
        ]
        dates = [date for date in dates if date]
        if dates:
            return max(dates)
        # A total column defines a billing section.  If that section has no
        # payment date, do not borrow a date from another semester.
        return ""

    candidates = [
        (abs(column_index(entry.get("column")) - fee_column), excel_date(entry.get("value")))
        for entry in entries
        if entry.get("kind") == "payment_date" and excel_date(entry.get("value"))
    ]
    distance, date = min(candidates, default=(10**9, ""))
    return date if distance <= 20 else ""


def payroll_teacher_name(sheet_name: str, total_row: dict[str, Any]) -> str:
    if str(total_row.get("A") or "").strip():
        return str(total_row["A"]).strip()
    prefix = sheet_name.split(" - ", 1)[0].strip()
    return {
        "化學師資": "周逸化學",
        "物理師資-Nick": "粘立物理",
        "英文師資": "小楊英文",
        "數學師資-明軒": "明軒數學",
        "數學師資-黃浩": "黃浩數學",
        "社會師資-蔣明": "蔣明社會",
        "國文師資": "國文師資",
    }.get(prefix, prefix)


def payroll_headcount(row: dict[str, Any], headers: dict[str, Any]) -> int:
    total = parse_number(row.get("J"))
    share = parse_number(row.get("I"))
    if "人數津貼" in str(headers.get("I") or ""):
        return max(0, round(15 + share / 300))
    if share > 0:
        return max(0, round(total / share))
    return 0


def payroll_settlements(snapshot: dict[str, Any], now: str, batch_id: str) -> dict[str, dict[str, Any]]:
    monthly: dict[str, list[tuple[str, dict[str, Any]]]] = defaultdict(list)
    for teacher_sheet in snapshot.get("teacherSheets") or []:
        sheet_name = str((teacher_sheet.get("summary") or {}).get("sheet") or "")
        for block in teacher_sheet.get("payrollBlocks") or []:
            match = PAYROLL_TITLE_RE.search(str(block.get("title") or ""))
            if not match:
                continue
            month = f"{match.group(1)}-{int(match.group(2)):02d}"
            monthly[month].append((sheet_name, block))

    results: dict[str, dict[str, Any]] = {}
    for month, blocks in sorted(monthly.items()):
        teachers: list[dict[str, Any]] = []
        classes: list[dict[str, Any]] = []
        for sheet_name, block in blocks:
            parsed_rows = [
                {cell.get("column"): cell.get("value") for cell in row.get("cells") or []}
                for row in block.get("rows") or []
            ]
            headers = parsed_rows[0] if parsed_rows else {}
            total_row = next((row for row in parsed_rows if str(row.get("B") or "").strip() == "總計"), {})
            teacher_name = payroll_teacher_name(sheet_name, total_row)
            class_map: dict[str, dict[str, Any]] = {}
            for row in parsed_rows[1:]:
                course_name = str(row.get("B") or "").strip()
                amount = rounded_amount(row.get("J"))
                if not course_name or course_name == "總計" or not amount:
                    continue
                course_base = re.sub(r"\d+\s*$", "", course_name).strip() or course_name
                current = class_map.setdefault(
                    course_base,
                    {
                        "rosterKey": "",
                        "teacherName": teacher_name,
                        "courseName": course_base,
                        "methodKind": "importedNumbers",
                        "methodLabel": "Numbers 匯入薪資表",
                        "sessionCount": 0,
                        "personSessions": 0,
                        "total": 0,
                        "headcountText": "",
                        "status": "由 Numbers 薪資表匯入",
                        "sessionDetails": [],
                        "skippedEventCount": 0,
                    },
                )
                headcount = payroll_headcount(row, headers)
                current["sessionDetails"].append(
                    {
                        "sessionNo": len(current["sessionDetails"]) + 1,
                        "date": excel_date(row.get("A")),
                        "headcount": headcount,
                        "amount": amount,
                    }
                )
                current["sessionCount"] += 1
                current["personSessions"] += headcount
                current["total"] += amount

            teacher_classes = list(class_map.values())
            for row in teacher_classes:
                counts = [str(detail["headcount"]) for detail in row["sessionDetails"] if detail["headcount"]]
                row["headcountText"] = "、".join(counts[:8]) + ("…" if len(counts) > 8 else "")
            teacher = {
                "key": f"{teacher_name}::Numbers 匯入薪資表",
                "teacherName": teacher_name,
                "methodLabel": "Numbers 匯入薪資表",
                "classCount": len(teacher_classes),
                "sessionCount": sum(row["sessionCount"] for row in teacher_classes),
                "personSessions": sum(row["personSessions"] for row in teacher_classes),
                "total": rounded_amount(total_row.get("J")) or sum(row["total"] for row in teacher_classes),
            }
            if teacher["sessionCount"]:
                teachers.append(teacher)
                classes.extend(teacher_classes)

        settlement_id = f"numbers_payroll_settlement_{month}"
        results[settlement_id] = {
            "id": settlement_id,
            "generatedAt": now,
            "savedAt": now,
            "month": month,
            "settings": {"source": "importedNumbersPayroll", "batchId": batch_id, "locked": True},
            "teachers": sorted(teachers, key=lambda row: (-row["total"], row["teacherName"])),
            "classes": sorted(classes, key=lambda row: (row["teacherName"], row["courseName"])),
            "calculatedClassCount": len(classes),
            "missingClassCount": 0,
            "total": sum(row["total"] for row in teachers),
            "source": "numbersImport",
            "sourceBatchId": batch_id,
            "locked": True,
        }
    return results


def existing_map(accounting: dict[str, Any], kind: str) -> dict[str, dict[str, Any]]:
    return dict(((accounting.get("manual") or {}).get(kind) or {}))


def with_sync(record: dict[str, Any], now: str) -> dict[str, Any]:
    return {**record, "syncedAt": now, "syncedBy": "codex-numbers-import"}


def build_update(
    snapshot: dict[str, Any],
    accounting: dict[str, Any],
    batch_id: str,
    now: str,
    required_unique_names: list[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    entries_by_student: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in snapshot.get("tuitionEntries") or []:
        entries_by_student[str(entry.get("studentId") or "")].append(entry)

    old = {
        kind: existing_map(accounting, kind)
        for kind in [
            "manualStudents",
            "manualTerms",
            "manualTeachers",
            "manualCourses",
            "manualCourseEnrollments",
            "receivables",
            "paymentLedger",
            "studentNotes",
            "payrollSettlements",
            "accountingAccounts",
        ]
    }
    desired: dict[str, dict[str, dict[str, Any]]] = {kind: {} for kind in old}
    desired["accountingAccounts"]["asset_unclassified"] = {
        "id": "asset_unclassified",
        "code": "1099",
        "name": "既有收付款（方式未記）",
        "type": "待分類",
        "purpose": "Numbers 歷史資料未記付款方式時使用",
    }

    generated_courses: dict[str, dict[str, Any]] = {}
    generated_terms: set[str] = set()
    generated_teachers: set[str] = set()
    unmatched_fee_count = 0
    paid_receivable_count = 0

    for student in snapshot.get("students") or []:
        student_id = str(student.get("id") or "")
        profile = dict(student.get("profile") or {})
        student_name = str(profile.get("name") or "").strip()
        if not student_id or not student_name:
            continue
        prior = old["manualStudents"].get(safe_key(student_id), {})
        desired["manualStudents"][student_id] = {
            "id": student_id,
            "source": "numbersImport",
            "sourceBatchId": batch_id,
            "sourceStudentId": student_id,
            "createdAt": prior.get("createdAt") or now,
            "updatedAt": now,
            "archived": False,
            "sheet": student.get("sheet") or "",
            "row": student.get("row") or "",
            "selectedCourses": student.get("selectedCourses") or [],
            "profile": {**profile, "name": student_name, "note": profile.get("note") or ""},
        }

        courses = normalized_courses(student)
        course_by_id: dict[str, dict[str, Any]] = {}
        for course in courses:
            course_id = stable_id(
                "course",
                [student.get("sheet"), course["term"], course["normalizedGroup"], course["header"], course.get("column")],
            )
            teacher_assignment = teacher_assignment_for_course(
                course["header"], str(student.get("sheet") or ""), course["term"]
            )
            instructor_name = teacher_assignment["instructorName"]
            teacher_name = teacher_assignment["payrollPayeeName"]
            generated_terms.add(course["term"])
            if teacher_name:
                generated_teachers.add(teacher_name)
            course["courseId"] = course_id
            course["teacherName"] = teacher_name
            course["instructorName"] = instructor_name
            course["payrollPayeeName"] = teacher_name
            course_by_id[course_id] = course
            generated_courses.setdefault(
                course_id,
                {
                    "id": course_id,
                    "createdAt": (old["manualCourses"].get(safe_key(course_id)) or {}).get("createdAt") or now,
                    "updatedAt": now,
                    "archived": False,
                    "cohort": student.get("sheet") or "",
                    "term": course["term"],
                    "subject": course["subject"],
                    "courseName": course["header"],
                    "teacherName": teacher_name,
                    "instructorName": instructor_name,
                    "payrollPayeeName": teacher_name,
                    "defaultTuition": 21600,
                    "refundUnitPrice": 1000,
                    "sessionCount": 24,
                    "source": "numbersImport",
                    "sourceBatchId": batch_id,
                    "sourceColumn": course.get("column") or "",
                    "sourceGroup": course["normalizedGroup"],
                    "note": "由目前 Numbers 名冊匯入",
                },
            )

        student_entries = entries_by_student.get(student_id, [])
        fee_entries = [
            entry
            for entry in student_entries
            if entry.get("kind") == "tuition"
            and rounded_amount(entry.get("value")) > 0
            and not TOTAL_TUITION_RE.search(str(entry.get("header") or ""))
        ]
        assigned: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for fee in fee_entries:
            candidates = [
                (score, course)
                for course in courses
                if (score := fee_course_score(fee, course)) is not None
            ]
            if candidates:
                _, chosen = min(candidates, key=lambda item: item[0])
                assigned[chosen["courseId"]].append(fee)
                continue

            unmatched_fee_count += 1
            fee_column = column_index(fee.get("column"))
            nearest_course = min(
                (course for course in courses if course["columnIndex"] <= fee_column),
                key=lambda course: fee_column - course["columnIndex"],
                default=None,
            )
            term = nearest_course["term"] if nearest_course else infer_term("", student.get("sheet"))
            synthetic_id = stable_id(
                "course",
                [student.get("sheet"), term, "Numbers帳務", fee.get("header"), fee.get("column")],
            )
            generated_terms.add(term)
            generated_courses.setdefault(
                synthetic_id,
                {
                    "id": synthetic_id,
                    "createdAt": (old["manualCourses"].get(safe_key(synthetic_id)) or {}).get("createdAt") or now,
                    "updatedAt": now,
                    "archived": False,
                    "cohort": student.get("sheet") or "",
                    "term": term,
                    "subject": canonical_subject(fee.get("header")),
                    "courseName": f"Numbers帳務：{fee.get('header') or '未對應學收'}",
                    "teacherName": "",
                    "defaultTuition": 0,
                    "refundUnitPrice": 1000,
                    "sessionCount": 0,
                    "source": "numbersImport",
                    "sourceBatchId": batch_id,
                    "sourceColumn": fee.get("column") or "",
                    "sourceGroup": "Numbers 未勾課程但有學收",
                    "note": "保留 Numbers 學收，未推測所屬課程",
                },
            )
            course_by_id[synthetic_id] = {
                "courseId": synthetic_id,
                "header": generated_courses[synthetic_id]["courseName"],
                "term": term,
                "teacherName": "",
            }
            assigned[synthetic_id].append(fee)

        for course_id, course in course_by_id.items():
            fees = assigned.get(course_id, [])
            amount = sum(rounded_amount(fee.get("value")) for fee in fees)
            payment_dates = [payment_date_for_fee(fee, student_entries) for fee in fees]
            payment_dates = [date for date in payment_dates if date]
            payment_date = max(payment_dates, default="")
            enrollment_id = f"manual_enrollment_{safe_key(course_id)}_{safe_key(student_id)}"
            prior_enrollment = old["manualCourseEnrollments"].get(safe_key(enrollment_id), {})
            fee_labels = [f"{fee.get('header')} {rounded_amount(fee.get('value')):,}" for fee in fees]
            desired["manualCourseEnrollments"][enrollment_id] = {
                "id": enrollment_id,
                "createdAt": prior_enrollment.get("createdAt") or now,
                "updatedAt": now,
                "courseId": course_id,
                "courseName": generated_courses[course_id]["courseName"],
                "studentId": student_id,
                "studentName": student_name,
                "tuitionAmount": amount,
                "originalAmount": amount,
                "discountAmount": 0,
                "packageDiscountAmount": 0,
                "voucherAmount": 0,
                "dueDate": payment_date,
                "paymentDate": payment_date,
                "status": "active",
                "source": "numbersImport",
                "sourceBatchId": batch_id,
                "note": "；".join(fee_labels) or "Numbers 有勾課程，未記學收",
            }
            if amount <= 0:
                continue
            receivable_id = f"receivable_{safe_key(enrollment_id)}"
            prior_receivable = old["receivables"].get(safe_key(receivable_id), {})
            is_paid = bool(payment_date)
            desired["receivables"][receivable_id] = {
                "id": receivable_id,
                "source": "numbersImport",
                "sourceBatchId": batch_id,
                "sourceEnrollmentId": enrollment_id,
                "enrollmentId": enrollment_id,
                "studentId": student_id,
                "studentName": student_name,
                "courseId": course_id,
                "courseName": generated_courses[course_id]["courseName"],
                "accountId": "ar_tuition",
                "incomeAccountId": "income_tuition",
                "originalAmount": amount,
                "discountAmount": 0,
                "packageDiscountAmount": 0,
                "voucherAmount": 0,
                "amount": amount,
                "paidAmount": amount if is_paid else 0,
                "balance": 0 if is_paid else amount,
                "issuedDate": payment_date,
                "dueDate": payment_date,
                "status": "paid" if is_paid else "open",
                "followUpStatus": "已收款" if is_paid else "待確認",
                "note": "；".join(fee_labels),
                "createdAt": prior_receivable.get("createdAt") or now,
                "updatedAt": now,
            }
            if is_paid:
                paid_receivable_count += 1
                payment_id = f"numbers_payment_{safe_key(receivable_id)}"
                prior_payment = old["paymentLedger"].get(safe_key(payment_id), {})
                desired["paymentLedger"][payment_id] = {
                    "id": payment_id,
                    "receivableId": receivable_id,
                    "source": "numbersImport",
                    "sourceBatchId": batch_id,
                    "sourceEnrollmentId": enrollment_id,
                    "studentId": student_id,
                    "studentName": student_name,
                    "courseName": generated_courses[course_id]["courseName"],
                    "date": payment_date,
                    "amount": amount,
                    "method": "Numbers 既有紀錄（方式未記）",
                    "assetAccountId": "asset_unclassified",
                    "incomeAccountId": "income_tuition",
                    "note": "依 Numbers 繳費日期匯入；未推測付款方式",
                    "status": "posted",
                    "createdAt": prior_payment.get("createdAt") or now,
                    "updatedAt": now,
                }

        for entry in student_entries:
            kind = str(entry.get("kind") or "")
            if kind not in {"refund", "discount_or_voucher", "note"}:
                continue
            entry_id = stable_id(
                "numbers_adjustment",
                [student_id, entry.get("column"), kind, entry.get("header")],
            )
            value = str(entry.get("value") if entry.get("value") is not None else "").strip()
            amount = rounded_amount(value)
            kind_label = {"refund": "Numbers 退費", "discount_or_voucher": "Numbers 抵扣", "note": "Numbers 帳務備註"}[kind]
            readable = f"{entry.get('header') or kind_label}：{amount:,}" if amount else f"{entry.get('header') or kind_label}：{value}"
            prior_note = old["studentNotes"].get(safe_key(entry_id), {})
            desired["studentNotes"][entry_id] = {
                "id": entry_id,
                "studentId": student_id,
                "studentName": student_name,
                "kind": kind_label,
                "note": f"{readable}（{student.get('sheet')}，欄 {entry.get('column')}）",
                "source": "numbersImport",
                "sourceBatchId": batch_id,
                "createdAt": prior_note.get("createdAt") or now,
                "updatedAt": now,
                "archived": False,
            }
            if kind == "refund" and amount > 0:
                refund_id = stable_id("numbers_refund", [student_id, entry.get("column")])
                prior_refund = old["paymentLedger"].get(safe_key(refund_id), {})
                desired["paymentLedger"][refund_id] = {
                    "id": refund_id,
                    "receivableId": "",
                    "source": "numbersImport",
                    "sourceBatchId": batch_id,
                    "studentId": student_id,
                    "studentName": student_name,
                    "courseName": "Numbers 退費（未分科）",
                    "date": "",
                    "amount": -abs(amount),
                    "method": "Numbers 既有紀錄（日期與方式未記）",
                    "assetAccountId": "asset_unclassified",
                    "incomeAccountId": "income_tuition",
                    "note": f"保留 Numbers 退費金額；未推測日期、付款方式或所屬課程（欄 {entry.get('column')}）",
                    "status": "posted",
                    "createdAt": prior_refund.get("createdAt") or now,
                    "updatedAt": now,
                }

    for term in generated_terms:
        term_id = stable_id("manual_term", [term])
        prior = old["manualTerms"].get(safe_key(term_id), {})
        desired["manualTerms"][term_id] = {
            "id": term_id,
            "label": term,
            "startMonth": "",
            "endMonth": "",
            "note": "由目前 Numbers 名冊匯入",
            "source": "numbersImport",
            "sourceBatchId": batch_id,
            "archived": False,
            "createdAt": prior.get("createdAt") or now,
            "updatedAt": now,
        }

    for teacher_name in generated_teachers:
        teacher_id = stable_id("manual_teacher", [teacher_name])
        prior = old["manualTeachers"].get(safe_key(teacher_id), {})
        desired["manualTeachers"][teacher_id] = {
            "id": teacher_id,
            "name": teacher_name,
            "subject": canonical_subject(teacher_name),
            "defaultShare": 50,
            "defaultFixedRate": 0,
            **payroll_defaults_for_teacher(teacher_name),
            "contact": "",
            "note": "由目前 Numbers 名冊與薪資表正規化",
            "source": "numbersImport",
            "sourceBatchId": batch_id,
            "archived": False,
            "createdAt": prior.get("createdAt") or now,
            "updatedAt": now,
        }

    desired["manualCourses"].update(generated_courses)
    desired["payrollSettlements"].update(payroll_settlements(snapshot, now, batch_id))

    updates: dict[str, Any] = {}
    for kind, records in desired.items():
        for record_id, record in records.items():
            updates[f"manual/{kind}/{safe_key(record_id)}"] = with_sync(record, now)

    archive_counts: Counter[str] = Counter()
    for kind in ["manualStudents", "manualTerms", "manualTeachers", "manualCourses", "manualCourseEnrollments"]:
        desired_keys = {safe_key(key) for key in desired[kind]}
        for firebase_key, record in old[kind].items():
            if firebase_key in desired_keys:
                continue
            is_old_import = record.get("source") in IMPORTED_SOURCES
            is_old_import = is_old_import or (
                kind in {"manualTerms", "manualTeachers"}
                and (str(record.get("id") or "").startswith(("manual_term_", "manual_teacher_", "fallback_teacher_")))
            )
            if not is_old_import:
                continue
            archived = {**record, "archived": True, "updatedAt": now, "archivedAt": now, "archivedByBatchId": batch_id}
            if kind == "manualCourseEnrollments":
                archived["status"] = "archived"
            updates[f"manual/{kind}/{firebase_key}"] = with_sync(archived, now)
            archive_counts[kind] += 1

    desired_receivables = {safe_key(key) for key in desired["receivables"]}
    for firebase_key, record in old["receivables"].items():
        if firebase_key in desired_receivables:
            continue
        enrollment_id = str(record.get("enrollmentId") or record.get("sourceEnrollmentId") or "")
        if record.get("source") not in IMPORTED_SOURCES and not enrollment_id.startswith("manual_enrollment_course_"):
            continue
        voided = {
            **record,
            "status": "void",
            "paidAmount": 0,
            "balance": 0,
            "voidedAt": now,
            "voidReason": f"由 {batch_id} 取代的舊 Numbers 匯入資料",
            "updatedAt": now,
        }
        updates[f"manual/receivables/{firebase_key}"] = with_sync(voided, now)
        archive_counts["receivables"] += 1

    for kind in ["paymentLedger", "studentNotes", "payrollSettlements"]:
        desired_keys = {safe_key(key) for key in desired[kind]}
        for firebase_key, record in old[kind].items():
            if firebase_key in desired_keys or record.get("source") != "numbersImport":
                continue
            stale = {**record, "updatedAt": now, "supersededByBatchId": batch_id}
            if kind == "paymentLedger":
                stale["status"] = "reversed"
            else:
                stale["archived"] = True
            updates[f"manual/{kind}/{firebase_key}"] = with_sync(stale, now)
            archive_counts[kind] += 1

    raw_batch = {key: value for key, value in snapshot.items() if key != "source"}
    raw_batch["cloudImport"] = {
        "batchId": batch_id,
        "importedAt": now,
        "sourceFileName": Path(str(snapshot.get("source") or "Numbers.xlsx")).name,
        "authority": "目前開啟的 Numbers 高中部學生名冊",
    }
    updates[f"importBatches/{safe_key(batch_id)}"] = raw_batch
    updates["currentImportBatchId"] = batch_id

    counts = {kind: len(records) for kind, records in desired.items()}
    validation = {
        "studentCount": len(desired["manualStudents"]),
        "courseCount": len(desired["manualCourses"]),
        "enrollmentCount": len(desired["manualCourseEnrollments"]),
        "receivableCount": len(desired["receivables"]),
        "paidReceivableCount": paid_receivable_count,
        "paymentLedgerCount": len(desired["paymentLedger"]),
        "noteCount": len(desired["studentNotes"]),
        "payrollSettlementCount": len(desired["payrollSettlements"]),
        "unmatchedFeeCount": unmatched_fee_count,
        "archivedOrVoided": dict(archive_counts),
        "desiredCounts": counts,
        "may2026PayrollTotal": (desired["payrollSettlements"].get("numbers_payroll_settlement_2026-05") or {}).get("total", 0),
    }

    names = Counter(record["profile"]["name"] for record in desired["manualStudents"].values())
    for name in required_unique_names or []:
        if names[name] != 1:
            raise ValueError(f"{name} 應為 1 筆，實際為 {names[name]} 筆")
    if validation["studentCount"] != snapshot.get("summary", {}).get("studentCount"):
        raise ValueError("學生主檔筆數與解析快照不一致")
    if validation["may2026PayrollTotal"] != 1022990:
        raise ValueError(f"2026-05 薪資總額不符：{validation['may2026PayrollTotal']}")
    invalid_paths = [path for path in updates if any(char in path.split("/")[-1] for char in ".#$[]")]
    if invalid_paths:
        raise ValueError(f"Firebase key 含非法字元：{invalid_paths[:3]}")
    return updates, validation


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a complete BearHigh Numbers master import update.")
    parser.add_argument("--input", required=True, help="Parsed Numbers snapshot JSON")
    parser.add_argument("--existing", required=True, help="Current /accounting backup JSON")
    parser.add_argument("--output", required=True, help="Firebase multi-location update JSON")
    parser.add_argument("--summary-output", required=True, help="Validation summary JSON")
    parser.add_argument("--batch-id", required=True)
    parser.add_argument(
        "--require-unique-name",
        action="append",
        default=[],
        help="Optional validation: require this student name to occur exactly once; may be repeated",
    )
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    existing_path = Path(args.existing).expanduser().resolve()
    snapshot = json.loads(input_path.read_text(encoding="utf-8"))
    accounting = json.loads(existing_path.read_text(encoding="utf-8"))
    now = datetime.now(TAIPEI).isoformat(timespec="seconds")
    batch_id = safe_key(args.batch_id)
    updates, summary = build_update(
        snapshot,
        accounting,
        batch_id,
        now,
        required_unique_names=args.require_unique_name,
    )

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(updates, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    summary_path = Path(args.summary_output).expanduser().resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_payload = {
        "batchId": batch_id,
        "generatedAt": now,
        "output": str(output_path),
        "payloadBytes": output_path.stat().st_size,
        "updatePathCount": len(updates),
        **summary,
    }
    summary_path.write_text(json.dumps(summary_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary_payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
