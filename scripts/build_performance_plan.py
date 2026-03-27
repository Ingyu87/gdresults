import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVAL_PLAN_PATH = ROOT / "data" / "evaluation-plan.json"
PDF_JSON_DIR = ROOT / "pdf_json"
OUTPUT_PATH = ROOT / "data" / "performance-plan.json"


CODE_RE = re.compile(r"\[[^\]]+\]")
# 성취기준 코드만 매칭 (예: [4국05-04], [3국독서인문01-02])
NEXT_STANDARD_RE = re.compile(r"\[[1-6][가-힣A-Za-z0-9]+[0-9]{2}-[0-9]{2}\]")


def normalize_spaces(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def get_grade_pdf_texts() -> dict:
    by_grade = {}
    for path in PDF_JSON_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        source = data.get("source_pdf", "")
        grade_match = re.search(r"1학기\s*([1-6])학년", source)
        if not grade_match:
            grade_match = re.search(r"([1-6])학년\s*전과목", source)
        if not grade_match:
            continue
        grade = f"{grade_match.group(1)}학년"
        by_grade[grade] = data.get("full_text", "")
    return by_grade


def find_section(full_text: str, standard_text: str) -> str:
    codes = CODE_RE.findall(standard_text)
    if not codes:
        return ""

    positions = []
    for code in codes:
        idx = full_text.find(code)
        if idx != -1:
            positions.append(idx)
    if not positions:
        return ""

    start = min(positions)
    search_from = max(positions) + 1
    next_match = NEXT_STANDARD_RE.search(full_text, search_from)
    end = next_match.start() if next_match else len(full_text)
    return full_text[start:end]


def extract_evaluation_element(section: str) -> str:
    bullet_positions = [m.start() for m in re.finditer(r"•", section)]
    if not bullet_positions:
        return ""

    start = bullet_positions[0]
    method_start_match = re.search(r"\n\[[^\]]*(수업|학습)\]", section[start:])
    if method_start_match:
        end = start + method_start_match.start()
    else:
        end = len(section)
    raw = section[start:end]
    raw = re.sub(r"•\s*", "• ", raw)
    return normalize_spaces(raw)


def extract_method(section: str) -> str:
    start_match = re.search(r"\[[^\]]*(수업|학습)\]", section)
    if not start_match:
        return ""
    start = start_match.start()

    level_match = re.search(r"(잘함|보통|노력요함)", section[start:])
    if level_match:
        end = start + level_match.start()
    else:
        end = len(section)
    return normalize_spaces(section[start:end])


def extract_criteria(section: str) -> dict:
    text = normalize_spaces(section)
    result = {"잘함": "", "보통": "", "노력요함": ""}

    pattern = re.search(r"잘함(.*?)보통(.*?)노력요함(.*)", text, re.S)
    if pattern:
        result["잘함"] = normalize_spaces(pattern.group(1))
        result["보통"] = normalize_spaces(pattern.group(2))
        result["노력요함"] = normalize_spaces(pattern.group(3))

        # 다음 성취기준 코드가 붙은 경우 뒷부분 절단
        for key in list(result.keys()):
            m = NEXT_STANDARD_RE.search(result[key])
            if m:
                result[key] = normalize_spaces(result[key][: m.start()])
            subject_header_pos = result[key].find("• ")
            if subject_header_pos != -1 and "성취기준" in result[key][subject_header_pos:]:
                result[key] = normalize_spaces(result[key][:subject_header_pos])
    return result


def extract_assessment_time(section: str) -> str:
    found = re.findall(r"([1-9]|1[0-2])월", section)
    if not found:
        return ""
    unique = []
    for month in found:
        token = f"{month}월"
        if token not in unique:
            unique.append(token)
    return ", ".join(unique[:3])


def main():
    eval_plan = json.loads(EVAL_PLAN_PATH.read_text(encoding="utf-8"))
    grade_texts = get_grade_pdf_texts()

    output = {}
    for grade, subjects in eval_plan.items():
        full_text = grade_texts.get(grade, "")
        output[grade] = {}
        for subject, entries in subjects.items():
            output[grade][subject] = []
            for entry in entries:
                standard = entry.get("standard", "")
                section = find_section(full_text, standard)
                section = normalize_spaces(section)
                data = {
                    "domain": entry.get("domain", ""),
                    "standard": standard,
                    "evaluation_element": extract_evaluation_element(section),
                    "lesson_assessment_method": extract_method(section),
                    "criteria": extract_criteria(section),
                    "assessment_time": extract_assessment_time(section),
                    "source_excerpt": section[:1500],
                }
                output[grade][subject].append(data)

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
