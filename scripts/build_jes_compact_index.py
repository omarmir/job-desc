#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
JES_DIR = ROOT / "resources" / "JES"
RESOURCES_INDEX = ROOT / "resources_index.md"
OUT_FILE = ROOT / "resources" / "jes_compact_index.json"


MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

STOPWORDS = {
    "a",
    "about",
    "above",
    "after",
    "all",
    "also",
    "an",
    "and",
    "any",
    "are",
    "as",
    "at",
    "be",
    "because",
    "been",
    "being",
    "below",
    "between",
    "both",
    "by",
    "can",
    "consists",
    "data",
    "do",
    "effective",
    "for",
    "from",
    "general",
    "group",
    "groups",
    "have",
    "in",
    "includes",
    "including",
    "introduction",
    "is",
    "it",
    "its",
    "job",
    "jobs",
    "level",
    "levels",
    "management",
    "method",
    "more",
    "not",
    "of",
    "on",
    "only",
    "or",
    "other",
    "out",
    "positions",
    "primarily",
    "purpose",
    "responsibility",
    "services",
    "standard",
    "such",
    "than",
    "that",
    "the",
    "their",
    "them",
    "there",
    "these",
    "this",
    "those",
    "through",
    "to",
    "under",
    "used",
    "use",
    "using",
    "various",
    "where",
    "which",
    "with",
    "work",
    "issued",
    "date",
    "branch",
    "division",
    "policy",
    "personnel",
    "resources",
    "information",
    "systems",
    "classification",
    "occupational",
    "sub",
    "group",
    "groups",
    "job",
    "standard",
}

HEADING_RE = re.compile(r"^(#{1,6}\s+.+|[A-Z][A-Z0-9 /'(),.-]{3,})$", re.M)
DATE_RE = re.compile(
    rf"effective\s+({'|'.join(MONTHS)})\s+\d{{1,2}},\s+\d{{4}}", re.I
)
LEVEL_CODE_RE = re.compile(r"\b([A-Z]{1,4}(?:-[A-Z]{2,4})?-\d{1,2}|EX-\d{2}|AS-\d)\b")


@dataclass
class Entry:
    code: str
    title: str
    src: str
    fmt: str
    effective: str | None
    plan: str | None
    group_def: str | None
    inc: list[str]
    exc: list[str]
    factors: list[str]
    levels: list[str]
    subgroups: list[str]
    tags: list[str]
    aliases: list[str]

    def to_dict(self) -> dict:
        return {
            "c": self.code,
            "t": self.title,
            "src": self.src,
            "fmt": self.fmt,
            "eff": self.effective,
            "plan": self.plan,
            "def": self.group_def,
            "inc": self.inc,
            "exc": self.exc,
            "fac": self.factors,
            "lvl": self.levels,
            "sg": self.subgroups,
            "tags": self.tags,
            "alias": self.aliases,
        }


def main() -> None:
    routing = parse_routing_keywords(RESOURCES_INDEX.read_text())
    entries = []
    level_reference = None

    for path in sorted(JES_DIR.iterdir()):
        if path.suffix.lower() not in {".md", ".pdf"}:
            continue
        if path.name == "01 Job evaluation standards - levels and point ranges.pdf":
            level_reference = {
                "src": str(path.relative_to(ROOT)),
                "title": "Job evaluation standards: levels and point ranges",
            }
            continue
        text = extract_text(path)
        code = infer_code(path)
        title = infer_title(path, text, code)
        effective = extract_effective_date(text)
        plan = detect_plan(text)
        group_def = compress_paragraph(extract_group_definition(text))
        inc = extract_section_bullets(text, ["Inclusions"], limit=6)
        exc = extract_section_bullets(text, ["Exclusions"], limit=6)
        factors = extract_factors(text)
        levels = extract_levels(text, code)
        subgroups = extract_subgroups(text)
        aliases = build_aliases(code, title, subgroups)
        tags = build_tags(
            code=code,
            title=title,
            group_def=group_def,
            inclusions=inc,
            exclusions=exc,
            factors=factors,
            subgroups=subgroups,
            routing=routing.get(code, []),
        )
        entries.append(
            Entry(
                code=code,
                title=title,
                src=str(path.relative_to(ROOT)),
                fmt=path.suffix.lower().lstrip("."),
                effective=effective,
                plan=plan,
                group_def=group_def,
                inc=inc,
                exc=exc,
                factors=factors,
                levels=levels,
                subgroups=subgroups,
                tags=tags,
                aliases=aliases,
            ).to_dict()
        )

    payload = {
        "v": 1,
        "generated": str(date.today()),
        "about": (
            "Compact JES index for routing and search. Shared boilerplate is intentionally "
            "omitted; keep original JES files only for deep benchmark/degree review."
        ),
        "legend": {
            "c": "code",
            "t": "title",
            "src": "source file",
            "fmt": "source format",
            "eff": "effective date if found",
            "plan": "evaluation plan type",
            "def": "compressed group definition",
            "inc": "compressed inclusion duties",
            "exc": "compressed exclusion duties",
            "fac": "factors/elements",
            "lvl": "levels/point-boundary markers found",
            "sg": "subgroups",
            "tags": "search tags and normalized keywords",
            "alias": "code/title aliases",
        },
        "search": {
            "match_fields": ["c", "t", "alias", "tags", "def", "inc", "sg", "fac"],
            "normalization": [
                "lowercase",
                "strip punctuation",
                "split hyphenated forms",
                "simple stem variants",
                "singular/plural fallback",
            ],
        },
        "level_reference": level_reference,
        "entries": entries,
    }

    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")))


def extract_text(path: Path) -> str:
    if path.suffix.lower() == ".md":
        return path.read_text()
    result = subprocess.run(
        ["pdftotext", str(path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def infer_code(path: Path) -> str:
    stem = path.stem
    if " - " in stem:
        return stem.split(" - ", 1)[0].strip()
    return stem.replace(" (1)", "").strip()


def infer_title(path: Path, text: str, code: str) -> str:
    if path.suffix.lower() == ".pdf" and " - " in path.stem:
        return path.stem.split(" - ", 1)[1].replace(" - Job Evaluation Standard", "").replace(" (1)", "").strip()
    for line in text.splitlines():
        s = clean_inline(line)
        if not s:
            continue
        s = s.removeprefix("#").strip()
        if len(s) > 6 and "job evaluation standard" in s.lower():
            return s.replace("Job Evaluation Standard", "").replace("job evaluation standard", "").strip(" -")
    return code


def extract_effective_date(text: str) -> str | None:
    match = DATE_RE.search(text)
    if match:
        return match.group(0).replace("effective ", "").strip()
    return None


def detect_plan(text: str) -> str | None:
    lower = text.lower()
    if "point-rating" in lower or "point rating" in lower:
        return "point-rating"
    if "predominant degree" in lower:
        return "predominant-degree"
    if "level progression" in lower or "level progression chart" in lower:
        return "level-progression"
    if "level description method" in lower or "level description" in lower:
        return "level-description"
    if "benchmark" in lower and "factors" in lower:
        return "benchmark-based"
    return None


def extract_group_definition(text: str) -> str | None:
    text = text[:20000]
    sentence_patterns = [
        r"(The\s+[^.]{0,1400}\b(?:Group|group|classification|Classification)\b[^.]{0,1400}\bcomprises\s+positions[^.]{0,1400}\.)",
        r"(The\s+[^.]{0,1400}\bpositions that are primarily[^.]{0,1400}\.)",
        r"(The\s+[^.]{0,1400}\bengaged in[^.]{0,1400}\.)",
    ]
    for pattern in sentence_patterns:
        match = re.search(pattern, text, re.S)
        if match:
            sentence = compress_paragraph(match.group(1))
            if sentence and not is_low_signal(sentence):
                return sentence
    patterns = [
        r"##+\s+.*?group definition\s*\n+(.+?)(?=\n##+\s+|\Z)",
        r"Group Definition\s*\n[-=]+\n(.+?)(?=\n###?\s+|\Z)",
        r"GROUP DEFINITION\s*\n+(.+?)(?=\n[A-Z][A-Z ]{4,}\n|\Z)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.S | re.I)
        if match:
            block = match.group(1)
            para = first_meaningful_sentence(block[:4000])
            if para and not is_low_signal(para):
                return para
    fallback = first_meaningful_sentence(text[:2500])
    if fallback and not is_low_signal(fallback):
        return fallback
    return None


def extract_section_bullets(text: str, headers: list[str], limit: int) -> list[str]:
    for header in headers:
        block = extract_section_block(text, header)
        if not block:
            continue
        items = parse_bullets(block)
        if not items:
            para = first_meaningful_paragraph(block)
            if para:
                items = split_sentence_list(para)
        compact = [compress_paragraph(item) for item in items if item]
        compact = [item for item in compact if item and not is_low_signal(item)]
        return compact[:limit]
    return []


def extract_section_block(text: str, header: str) -> str | None:
    patterns = [
        rf"##+\s+{re.escape(header)}\s*\n+(.+?)(?=\n##+\s+|\Z)",
        rf"{re.escape(header)}\s*\n[-=]+\n(.+?)(?=\n[A-Z][A-Z0-9 /'(),.-]{{3,}}\n|\Z)",
        rf"{re.escape(header)}\s*\n+(.+?)(?=\n[A-Z][A-Z0-9 /'(),.-]{{3,}}\n|\Z)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.S | re.I)
        if match:
            return match.group(1)
    return None


def extract_factors(text: str) -> list[str]:
    block = extract_section_block(text, "Factors")
    if not block:
        for header in ["Elements", "Factor Weights", "Psychology Factors"]:
            block = extract_section_block(text, header)
            if block:
                break
    if not block:
        return []
    items = parse_bullets(block)
    if not items:
        items = extract_short_lines(block, max_words=8, limit=10)
    cleaned = []
    for item in items:
        compact = compress_paragraph(item)
        if not compact or is_low_signal(compact):
            continue
        if 1 <= len(compact.split()) <= 6:
            cleaned.append(compact)
    return dedupe(cleaned)[:10]


def extract_levels(text: str, code: str) -> list[str]:
    levels = []
    boundary_block = None
    for header in ["Point boundaries", "Classification Levels", "Point Range", "Level Boundaries"]:
        boundary_block = extract_section_block(text, header)
        if boundary_block:
            break
    if boundary_block:
        levels.extend(extract_level_lines(boundary_block, code))
    for match in re.findall(rf"\b{re.escape(code)}-\d{{1,2}}\b", text):
        levels.append(match)
    for match in re.findall(r"\bLevel\s+[1-9]\b", text, re.I):
        levels.append(clean_inline(match))
    return dedupe(levels)[:20]


def extract_subgroups(text: str) -> list[str]:
    patterns = [
        r"^#{2,4}\s+(.+?(?:Sub-group|Subgroup).*)$",
        r"^([A-Z][A-Za-z /'(),.-]+(?:Sub-group|Subgroup).*)$",
    ]
    hits: list[str] = []
    for pattern in patterns:
        hits.extend(re.findall(pattern, text, re.M))
    cleaned = []
    for hit in hits:
        s = clean_inline(hit).strip("- ")
        s = re.sub(r"^\d+\.\s*", "", s)
        if 4 < len(s) <= 60 and not is_low_signal(s):
            cleaned.append(s)
    return dedupe(cleaned)[:12]


def parse_routing_keywords(text: str) -> dict[str, list[str]]:
    routing: dict[str, list[str]] = {}
    capture = False
    for line in text.splitlines():
        if line.strip() == "## JES Routing Index":
            capture = True
            continue
        if capture and line.startswith("## "):
            break
        if not capture or not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 3 or cells[0] in {"Group", "---"}:
            continue
        code = cells[0]
        terms = [clean_inline(x) for x in cells[2].split(",")]
        routing[code] = [t for t in terms if t]
    return routing


def build_aliases(code: str, title: str, subgroups: list[str]) -> list[str]:
    aliases = {code, title, f"{code} {title}"}
    bare = title.replace("Job Evaluation Standard", "").strip()
    aliases.add(bare)
    for subgroup in subgroups:
        aliases.add(subgroup)
    aliases.update(split_title_terms(title))
    return sorted(x for x in aliases if 1 < len(x) <= 50 and not is_low_signal(x))[:12]


def build_tags(
    *,
    code: str,
    title: str,
    group_def: str | None,
    inclusions: list[str],
    exclusions: list[str],
    factors: list[str],
    subgroups: list[str],
    routing: list[str],
) -> list[str]:
    phrases = [code, title, group_def or "", *inclusions[:3], *exclusions[:2], *factors[:6], *subgroups[:4], *routing]
    tags: set[str] = set()
    for phrase in phrases:
        tags.update(expand_terms(phrase, max_terms=12))
    tags.update(expand_terms(title.replace("&", "and"), max_terms=10))
    tags.update(expand_terms(" ".join(routing), max_terms=14))
    filtered = []
    for tag in sorted(tags):
        if len(tag) <= 1 or len(tag) > 35 or tag in STOPWORDS:
            continue
        if tag.isdigit():
            continue
        filtered.append(tag)
    return filtered[:36]


def expand_terms(text: str, max_terms: int) -> set[str]:
    normalized = clean_inline(text).lower()
    normalized = normalized.replace("/", " ").replace("-", " ")
    raw_tokens = re.findall(r"[a-z0-9]{2,}", normalized)
    tags = set()
    for token in raw_tokens:
        if token in STOPWORDS:
            continue
        tags.add(token)
        stem = simple_stem(token)
        if stem and stem != token and len(stem) > 2:
            tags.add(stem)
        if token.endswith("s") and len(token) > 3:
            tags.add(token[:-1])
        if not token.endswith("s") and len(token) > 3:
            tags.add(token + "s")
    phrase_words = [t for t in raw_tokens if t not in STOPWORDS]
    for size in (2,):
        for i in range(len(phrase_words) - size + 1):
            phrase = " ".join(phrase_words[i : i + size])
            if len(phrase) > 4:
                tags.add(phrase)
    return set(sorted(tags)[:max_terms])


def simple_stem(token: str) -> str:
    for suffix in ("ation", "ition", "ments", "ment", "ities", "ity", "ances", "ance", "ings", "ing", "ers", "er", "ors", "or", "ies", "ied", "ed", "es", "s"):
        if token.endswith(suffix) and len(token) - len(suffix) >= 3:
            if suffix == "ies":
                return token[:-3] + "y"
            return token[: -len(suffix)]
    return token


def split_title_terms(title: str) -> Iterable[str]:
    for chunk in re.split(r"[^A-Za-z0-9]+", title):
        if len(chunk) > 1:
            yield chunk


def parse_bullets(block: str) -> list[str]:
    items = []
    for line in block.splitlines():
        s = clean_inline(line)
        if re.match(r"^(\*|-|\d+\.)\s+", s):
            items.append(re.sub(r"^(\*|-|\d+\.)\s+", "", s))
    return items


def extract_short_lines(block: str, max_words: int, limit: int) -> list[str]:
    lines = []
    for line in block.splitlines():
        s = clean_inline(line)
        if not s:
            continue
        wc = len(s.split())
        if 1 <= wc <= max_words and not s.lower().startswith(("table of", "introduction")):
            lines.append(s)
    return lines[:limit]


def extract_level_lines(block: str, code: str) -> list[str]:
    out = []
    for line in block.splitlines():
        s = clean_inline(line)
        if not s:
            continue
        if re.search(r"\b(level|classification level|point range|min\.|max\.)\b", s, re.I):
            if len(s) <= 40 and not is_low_signal(s):
                out.append(s)
    return out


def first_meaningful_paragraph(text: str) -> str | None:
    paragraphs = re.split(r"\n\s*\n", text)
    for para in paragraphs:
        cleaned = compress_paragraph(para)
        if len(cleaned.split()) >= 12 and not is_low_signal(cleaned):
            return cleaned
    return None


def first_meaningful_sentence(text: str) -> str | None:
    cleaned = compress_paragraph(text)
    if not cleaned:
        return None
    parts = re.split(r"(?<=[.])\s+", cleaned)
    for part in parts:
        part = compress_paragraph(part)
        if part and 8 <= len(part.split()) <= 80 and not is_low_signal(part):
            return part
    return None


def split_sentence_list(text: str) -> list[str]:
    parts = re.split(r"\s*(?:;|\.\s+)\s*", compress_paragraph(text))
    return [p for p in parts if len(p.split()) > 4]


def compress_paragraph(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = clean_inline(text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = cleaned.strip("|-:; ")
    return cleaned or None


def clean_inline(text: str) -> str:
    text = text.replace("\x0c", " ")
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = text.replace("**", "").replace("__", "")
    text = text.replace("\\-", "-").replace("\\.", ".")
    return text.strip()


def dedupe(items: Iterable[str | None]) -> list[str]:
    seen = set()
    out = []
    for item in items:
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def is_low_signal(text: str) -> bool:
    lowered = text.lower()
    if "issued by:" in lowered:
        return True
    if "record of amendments" in lowered:
        return True
    if "table of contents" in lowered:
        return True
    if "occupational sub-group definition maps" in lowered:
        return True
    if lowered.startswith("for occupational group allocation"):
        return True
    if lowered.startswith("the maps explicitly link"):
        return True
    if lowered.startswith("date inserted by"):
        return True
    if lowered.startswith("the total value determined for each job"):
        return True
    if lowered.startswith("- position classification and evaluation plan"):
        return True
    if lowered.startswith("(iv) part i"):
        return True
    if len(re.findall(r"[A-Za-z]", text)) < 8:
        return True
    return False


if __name__ == "__main__":
    main()
