from __future__ import annotations

import ctypes
import gc
import json
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT / "resources"
CASES_PATH = RESOURCES / "generation_benchmark_cases.json"
REPORT_PATH = RESOURCES / "generation_model_benchmarks.json"
DEFAULT_HF_HOME = Path.home() / ".cache" / "job-desc-hf"
HF_HOME = Path(os.environ.get("HF_HOME", str(DEFAULT_HF_HOME))).expanduser()

HF_HOME.mkdir(exist_ok=True)
os.environ["HF_HOME"] = str(HF_HOME)
os.environ.setdefault("TRANSFORMERS_CACHE", str(HF_HOME / "transformers"))
os.environ.setdefault("HF_HUB_CACHE", str(HF_HOME / "hub"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

CUDA_LIB_DIRS = [
    ROOT / ".venv" / "lib" / "python3.12" / "site-packages" / "nvidia" / "cu13" / "lib",
    ROOT / ".venv" / "lib" / "python3.12" / "site-packages" / "nvidia" / "cuda_nvrtc" / "lib",
]


def preload_cuda_libs() -> None:
    for library in (
        "libnvrtc.so.13",
        "libnvrtc-builtins.so.13.0",
        "libnvrtc.so.12",
        "libnvrtc-builtins.so.12.4",
    ):
        for directory in CUDA_LIB_DIRS:
            path = directory / library
            if path.exists():
                ctypes.CDLL(str(path), mode=ctypes.RTLD_GLOBAL)
                break


preload_cuda_libs()

import torch
from transformers import AutoModelForCausalLM, AutoModelForImageTextToText, AutoProcessor, AutoTokenizer

torch.backends.cuda.matmul.allow_tf32 = True


@dataclass(frozen=True)
class ModelSpec:
    app_id: str
    label: str
    family: str
    params: str
    dtype: str
    approx_download_mb: int
    hf_model_id: str
    batch_size: int
    benchmark_notes: str


MODEL_SPECS: list[ModelSpec] = [
    ModelSpec(
        app_id="onnx-community/gemma-3-270m-it-ONNX",
        label="Gemma 3 270M Edge",
        family="Gemma",
        params="270M",
        dtype="fp16",
        approx_download_mb=430,
        hf_model_id="unsloth/gemma-3-270m-it",
        batch_size=10,
        benchmark_notes="Benchmarked with the public Unsloth mirror of the Gemma 3 270M instruct family because the official Google weights are gated on Hugging Face.",
    ),
    ModelSpec(
        app_id="onnx-community/Qwen2.5-0.5B-Instruct",
        label="Qwen2.5 0.5B Instruct",
        family="Qwen",
        params="0.5B",
        dtype="fp16",
        approx_download_mb=620,
        hf_model_id="Qwen/Qwen2.5-0.5B-Instruct",
        batch_size=6,
        benchmark_notes="Benchmarked with the official Qwen2.5 0.5B instruct weights.",
    ),
    ModelSpec(
        app_id="onnx-community/gemma-3-1b-it-ONNX",
        label="Gemma 3 1B Instruct",
        family="Gemma",
        params="1B",
        dtype="fp16",
        approx_download_mb=998,
        hf_model_id="unsloth/gemma-3-1b-it",
        batch_size=4,
        benchmark_notes="Benchmarked with the public Unsloth mirror of the Gemma 3 1B instruct family because the official Google weights are gated on Hugging Face.",
    ),
]


def normalize(text: str) -> str:
    return " ".join(
        "".join(char.lower() if char.isalnum() or char in " /-" else " " for char in text).split()
    )


def stem(token: str) -> str:
    suffixes = ("ations", "ation", "ments", "ment", "ities", "ity", "ings", "ing", "ers", "ies", "ied", "er", "ed", "es", "s")
    for suffix in suffixes:
        if token.endswith(suffix) and len(token) > len(suffix) + 2:
            return token[: -len(suffix)]
    return token


def tokenize(text: str) -> list[str]:
    return [stem(token) for token in normalize(text).split(" ") if len(token) > 2]


def create_empty_sections() -> dict[str, str]:
    return {
        "organizational_context": "To be confirmed.",
        "client_service_results": "To be confirmed.",
        "key_activities": "- To be confirmed.",
        "skill": "To be confirmed.",
        "effort": "To be confirmed.",
        "responsibility": "To be confirmed.",
        "working_conditions": "To be confirmed.",
    }


SECTION_LABELS = {
    "organizational_context": "Organizational context",
    "client_service_results": "Client service results",
    "key_activities": "Key activities",
    "skill": "Skill",
    "effort": "Effort",
    "responsibility": "Responsibility",
    "working_conditions": "Working conditions",
}


def extract_section(body: str, heading: str, next_headings: list[str]) -> str | None:
    import re

    escaped_heading = re.escape(heading)
    next_pattern = "|".join(re.escape(item) for item in next_headings)
    pattern = rf"(?:^|\n)#+\s*{escaped_heading}\s*\n([\s\S]*?)(?=\n#+\s*(?:{next_pattern})\s*\n|$)"
    match = re.search(pattern, body, flags=re.IGNORECASE)
    return match.group(1).strip() if match else None


def normalize_bullets(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return "- To be confirmed."
    output: list[str] = []
    for line in lines:
      if line.startswith("- "):
          output.append(line)
      elif line.startswith("* "):
          output.append("- " + line[2:])
      elif len(line) > 2 and line[0].isdigit() and line[1:3] == ". ":
          output.append("- " + line[3:])
      else:
          output.append("- " + line)
    return "\n".join(output)


def extract_job_description_sections(raw_text: str) -> dict[str, str]:
    headings = list(SECTION_LABELS.values())
    sections = create_empty_sections()
    for index, (key, heading) in enumerate(SECTION_LABELS.items()):
        value = extract_section(raw_text, heading, headings[index + 1 :])
        if not value:
            sections[key] = sections[key]
            continue
        sections[key] = normalize_bullets(value) if key == "key_activities" else value.strip()
    return sections


def format_job_description_template(input_data: dict[str, Any], sections: dict[str, str]) -> str:
    return "\n".join(
        [
            "# Job Description Template",
            "",
            "## Part 1: Position information and signatures",
            "",
            "| Field | Value |",
            "| --- | --- |",
            "| Position number | To be confirmed |",
            f"| Position title | {input_data['jobTitle'].strip()} |",
            f"| Position classification | {input_data['selectedCode']} - {input_data['selectedTitle']} |",
            "| Position Effective date | To be confirmed |",
            "| Job Code | To be confirmed |",
            "| National occupational classification | To be confirmed |",
            "| Department/Agency Name | To be confirmed |",
            "| Geographic location | To be confirmed |",
            "| Organizational component (Branch/Division) | To be confirmed |",
            "| Office code | To be confirmed |",
            "| Language requirements | To be confirmed |",
            "| Linguistic profile | To be confirmed |",
            "| Communications requirements | To be confirmed |",
            "| Security requirements | To be confirmed |",
            "| Supervisor position number | To be confirmed |",
            "| Supervisor position title | To be confirmed |",
            "| Supervisor classification | To be confirmed |",
            "",
            "## Part 2: Job description",
            "",
            "### Organizational context",
            sections["organizational_context"],
            "",
            "### Client service results",
            sections["client_service_results"],
            "",
            "### Key activities",
            sections["key_activities"],
            "",
            "### Skill",
            sections["skill"],
            "",
            "### Effort",
            sections["effort"],
            "",
            "### Responsibility",
            sections["responsibility"],
            "",
            "### Working conditions",
            sections["working_conditions"],
        ]
    )


def score_coverage(markdown: str, expected_keywords: list[str]) -> float:
    text_tokens = set(tokenize(markdown))
    matched = [keyword for keyword in expected_keywords if stem(normalize(keyword)) in text_tokens]
    return len(matched) / max(len(expected_keywords), 1)


def score_grounding(markdown: str, entry: dict[str, Any]) -> float:
    text_tokens = set(tokenize(markdown))
    grounding_terms = [
        *entry.get("fac", [])[:3],
        *entry.get("tags", [])[:6],
        *entry.get("alias", [])[:2],
    ]
    unique_terms = []
    seen = set()
    for term in grounding_terms:
        normalized = stem(normalize(term))
        if len(normalized) > 3 and normalized not in seen:
            unique_terms.append(normalized)
            seen.add(normalized)
    hits = [term for term in unique_terms if term in text_tokens]
    return min(1.0, len(hits) / max(min(6, len(unique_terms)), 1)) if unique_terms else 0.5


def score_section_completeness(markdown: str) -> float:
    sections = extract_job_description_sections(markdown)
    defaults = create_empty_sections()
    filled_sections = sum(
        1 for key, value in sections.items() if value and value != defaults[key]
    )
    key_activity_lines = [line.strip() for line in sections["key_activities"].splitlines() if line.strip().startswith("- ")]
    bullet_score = 1.0 if 2 <= len(key_activity_lines) <= 3 else min(1.0, len(key_activity_lines) / 2)
    return min(1.0, filled_sections / 7 * 0.75 + bullet_score * 0.25)


def percentile(values: list[int], ratio: float) -> int:
    if not values:
        return 0
    sorted_values = sorted(values)
    index = min(len(sorted_values) - 1, math.floor(len(sorted_values) * ratio))
    return sorted_values[index]


def build_messages(input_data: dict[str, Any], entry: dict[str, Any]) -> list[dict[str, str]]:
    context_lines = [
        f"Selected classification: {input_data['selectedCode']} - {input_data['selectedTitle']}",
        f"Evaluation plan: {entry['plan']}" if entry.get("plan") else "",
        f"Observed levels: {', '.join(entry.get('lvl', [])[:4])}" if entry.get("lvl") else "",
        f"Group definition: {entry['def']}" if entry.get("def") else "",
        f"Factors: {', '.join(entry.get('fac', [])[:6])}" if entry.get("fac") else "",
        f"Additional user context: {input_data['context']}" if input_data.get("context") else "",
    ]
    context = "\n".join(line for line in context_lines if line)
    return [
        {
            "role": "system",
            "content": "You draft compact Canadian federal public service job description sections. Return markdown only. Use plain administrative language.",
        },
        {
            "role": "user",
            "content": "\n".join(
                [
                    "Prepare a compact, grounded Part 2 job description body for benchmarking.",
                    "",
                    f"Job title: {input_data['jobTitle']}",
                    f"Optional duties: {input_data['duties'] or 'None provided'}",
                    "",
                    "Classification context",
                    context,
                    "",
                    "Required headings",
                    "- Organizational context",
                    "- Client service results",
                    "- Key activities",
                    "- Skill",
                    "- Effort",
                    "- Responsibility",
                    "- Working conditions",
                    "",
                    "Content rules",
                    "- Organizational context: 1 or 2 bullets.",
                    "- Client service results: 1 short sentence.",
                    "- Key activities: 2 or 3 bullets.",
                    "- Skill, Effort, Responsibility, Working conditions: 1 short sentence each.",
                    '- Use "To be confirmed." if needed instead of inventing facts.',
                ]
            ),
        },
    ]


def build_multimodal_messages(input_data: dict[str, Any], entry: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "role": message["role"],
            "content": [{"type": "text", "text": message["content"]}],
        }
        for message in build_messages(input_data, entry)
    ]


def build_pending_result(spec: ModelSpec, notes: str, selected: bool = False) -> dict[str, Any]:
    return {
        "id": spec.app_id,
        "label": spec.label,
        "family": spec.family,
        "params": spec.params,
        "dtype": spec.dtype,
        "approxDownloadMB": spec.approx_download_mb,
        "loadMs": 0,
        "avgDurationMs": 0,
        "p95DurationMs": 0,
        "avgCharsPerSecond": 0,
        "groundingScore": 0,
        "coverageScore": 0,
        "sectionCompleteness": 0,
        "totalScore": 0,
        "benchmarked": False,
        "benchmarkNotes": notes,
        "selected": selected,
    }


def write_report(results: list[dict[str, Any]]) -> None:
    benchmarked = [item for item in results if item["benchmarked"]]
    if benchmarked:
        sorted_results = sorted(
            benchmarked,
            key=lambda item: (-item["totalScore"], item["avgDurationMs"]),
        )
        best = sorted_results[0]
        selected_id = best["id"]
        for item in sorted_results:
            if (
                best["totalScore"] - item["totalScore"] <= 0.03
                and item["approxDownloadMB"] < best["approxDownloadMB"]
                and item["avgDurationMs"] <= best["avgDurationMs"] * 1.25
            ):
                selected_id = item["id"]
                break
    else:
        selected_id = "HuggingFaceTB/SmolLM2-360M-Instruct"

    for item in results:
        item["selected"] = item["id"] == selected_id

    payload = {
        "generated": time.strftime("%Y-%m-%d"),
        "corpusSize": 100,
        "methodology": [
            "100 handcrafted role cases grounded in the JES corpus.",
            "Benchmarks run in Python with native Transformers models on the local NVIDIA RTX A2000 12GB.",
            "Gemma family benchmarks use public Unsloth mirrors of Gemma 3 and Gemma 3n instruct weights because the official Google Hugging Face repos are gated.",
            "Scores combine expected duty keyword coverage, JES grounding terms, and section completeness after template normalization.",
        ],
        "selectedModel": selected_id,
        "results": results,
    }
    REPORT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_existing_results() -> dict[str, dict[str, Any]]:
    if not REPORT_PATH.exists():
        return {}
    payload = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    return {
        item["id"]: item
        for item in payload.get("results", [])
        if item.get("benchmarked")
    }


def is_gemma3n(spec: ModelSpec) -> bool:
    return "gemma-3n" in spec.app_id.lower()


def benchmark_model(spec: ModelSpec, cases: list[dict[str, Any]], entries_by_code: dict[str, dict[str, Any]]) -> dict[str, Any]:
    print(f"Loading {spec.label} from {spec.hf_model_id}")
    started = time.perf_counter()
    tokenizer = None
    processor = None
    if is_gemma3n(spec):
        processor = AutoProcessor.from_pretrained(spec.hf_model_id, trust_remote_code=True)
        model = AutoModelForImageTextToText.from_pretrained(
            spec.hf_model_id,
            torch_dtype=torch.bfloat16,
            device_map="cuda:0",
            trust_remote_code=True,
        )
    else:
        tokenizer = AutoTokenizer.from_pretrained(spec.hf_model_id, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            spec.hf_model_id,
            torch_dtype=torch.float16,
            device_map="cuda:0",
            trust_remote_code=True,
        )
    model.eval()
    load_ms = round((time.perf_counter() - started) * 1000)

    if tokenizer is not None:
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        tokenizer.padding_side = "left"

    durations: list[int] = []
    total_chars = 0
    grounding_sum = 0.0
    coverage_sum = 0.0
    completeness_sum = 0.0

    with torch.inference_mode():
        for batch_start in range(0, len(cases), spec.batch_size):
            batch = cases[batch_start : batch_start + spec.batch_size]
            prompts: list[str] = []
            prepared_inputs: list[dict[str, Any]] = []
            prepared_entries: list[dict[str, Any]] = []

            for case in batch:
                entry = entries_by_code[case["code"]]
                input_data = {
                    "jobTitle": case["title"],
                    "duties": case.get("duties", ""),
                    "selectedCode": case["code"],
                    "selectedTitle": entry["t"],
                    "context": case.get("context", ""),
                }
                if is_gemma3n(spec):
                    messages = build_multimodal_messages(input_data, entry)
                    prompt = processor.apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=True,
                    )
                else:
                    messages = build_messages(input_data, entry)
                    prompt = tokenizer.apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=True,
                    )
                prompts.append(prompt)
                prepared_inputs.append(input_data)
                prepared_entries.append(entry)

            if is_gemma3n(spec):
                decoded: list[str] = []
                total_batch_duration_ms = 0
                for prompt in prompts:
                    tokenized = processor(
                        text=prompt,
                        images=None,
                        audio=None,
                        return_tensors="pt",
                        truncation=True,
                        max_length=1024,
                    ).to(model.device)
                    batch_started = time.perf_counter()
                    generated = model.generate(
                        **tokenized,
                        max_new_tokens=48,
                        do_sample=False,
                    )
                    total_batch_duration_ms += round((time.perf_counter() - batch_started) * 1000)
                    decoded.append(
                        processor.decode(
                            generated[0][tokenized["input_ids"].shape[1] :],
                            skip_special_tokens=True,
                        )
                    )
                    del generated
                    del tokenized
                    gc.collect()
                    torch.cuda.empty_cache()
                per_case_duration_ms = max(1, round(total_batch_duration_ms / len(batch)))
            else:
                tokenized = tokenizer(
                    prompts,
                    return_tensors="pt",
                    padding=True,
                    truncation=True,
                    max_length=1024,
                )
                tokenized = {key: value.to(model.device) for key, value in tokenized.items()}

                batch_started = time.perf_counter()
                generated = model.generate(
                    **tokenized,
                    max_new_tokens=48,
                    do_sample=False,
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id,
                )
                batch_duration_ms = round((time.perf_counter() - batch_started) * 1000)
                prompt_length = tokenized["input_ids"].shape[1]
                decoded = tokenizer.batch_decode(
                    generated[:, prompt_length:],
                    skip_special_tokens=True,
                )
                per_case_duration_ms = max(1, round(batch_duration_ms / len(batch)))

            for index, output_text in enumerate(decoded):
                durations.append(per_case_duration_ms)
                sections = extract_job_description_sections(output_text)
                markdown = format_job_description_template(prepared_inputs[index], sections)
                total_chars += len(markdown)
                grounding_sum += score_grounding(markdown, prepared_entries[index])
                coverage_sum += score_coverage(markdown, batch[index]["expectedKeywords"])
                completeness_sum += score_section_completeness(markdown)

            print(f"{spec.label}: {min(batch_start + len(batch), len(cases))}/{len(cases)}")

    del model
    torch.cuda.empty_cache()

    avg_duration_ms = round(sum(durations) / len(durations))
    total_duration_ms = sum(durations)
    avg_chars_per_second = round(total_chars / (total_duration_ms / 1000), 2) if total_duration_ms else 0
    grounding_score = round(grounding_sum / len(cases), 4)
    coverage_score = round(coverage_sum / len(cases), 4)
    section_completeness = round(completeness_sum / len(cases), 4)
    total_score = round(grounding_score * 0.35 + coverage_score * 0.45 + section_completeness * 0.2, 4)

    return {
        "id": spec.app_id,
        "label": spec.label,
        "family": spec.family,
        "params": spec.params,
        "dtype": spec.dtype,
        "approxDownloadMB": spec.approx_download_mb,
        "loadMs": load_ms,
        "avgDurationMs": avg_duration_ms,
        "p95DurationMs": percentile(durations, 0.95),
        "avgCharsPerSecond": avg_chars_per_second,
        "groundingScore": grounding_score,
        "coverageScore": coverage_score,
        "sectionCompleteness": section_completeness,
        "totalScore": total_score,
        "benchmarked": True,
        "benchmarkNotes": spec.benchmark_notes,
        "selected": False,
    }


def main() -> None:
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is not available. Run this script outside the sandbox with GPU access.")

    requested_model_id = os.environ.get("BENCH_MODEL_ID")
    case_start = int(os.environ.get("BENCH_CASE_START", "0"))
    case_count = int(os.environ.get("BENCH_CASE_COUNT", "100"))
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))[case_start : case_start + case_count]
    index = json.loads((RESOURCES / "jes_compact_index.json").read_text(encoding="utf-8"))
    entries_by_code = {entry["c"]: entry for entry in index["entries"]}
    existing_results = load_existing_results()

    results: list[dict[str, Any]] = []

    for spec in MODEL_SPECS:
        if requested_model_id and spec.app_id != requested_model_id:
            results.append(existing_results.get(spec.app_id, build_pending_result(spec, "Skipped in this benchmark run.")))
            continue

        result = benchmark_model(spec, cases, entries_by_code)
        results.append(result)
        pending = [
            existing_results.get(other.app_id, build_pending_result(other, "Pending benchmark in this run."))
            for other in MODEL_SPECS
            if other.app_id not in {item["id"] for item in results}
        ]
        write_report(results + pending)

    write_report(results)


if __name__ == "__main__":
    main()
