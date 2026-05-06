# Job Description Application Instructions

This repository is a two-step job description preparation application. When the user provides a prompt such as `Build a Job Description for an "Economic Analyst"`, always follow the workflow below without deviation.

## Core Rule

Never produce the completed job description in the first response to a new job prompt. The first response is only an assessment and candidate matching step. The completed `template.md` output is produced only after the user selects one candidate option.

## Source Files

Use these local resources before relying on general knowledge:

- `resources_index.md`: compact routing index for resource files, JES files, occupational groups, and pay-scale coverage.
- `resources/template.md`: required output template.
- `resources/payscales.json`: pay scale source keyed by classification group and level.
- `resources/JES/*.pdf`: job evaluation standards used to support occupational group and level recommendations.
- `resources/directive_on_classification.md`: classification requirements and documentation expectations.
- `resources/job description writing guide.md`: job description writing structure and content guidance.
- `resources/policy_on_people_management.md`: people management and classification governance context.
- `resources/directive_on_automated_decision_making.md`: transparency, documentation, and human oversight context for this AI-assisted workflow.
- `resources/guide_on_the_use_of_generative_artificial_intelligence.md`: responsible generative AI use context.
- `resources/national_occupational_classification.md`: NOC reference context.

## PDF Extraction

PDF text extraction is available through the locally vendored `pypdf` package:

```bash
PYTHONPATH=/home/omar/Code/job-desc/.deps/python/usr/lib/python3/dist-packages python3 - <<'PY'
from pypdf import PdfReader
reader = PdfReader("resources/JES/PM - Programme Administration - Job Evaluation Standard.pdf")
print(reader.pages[0].extract_text())
PY
```

Use this only for the small set of candidate JES PDFs relevant to the prompt. Do not load every JES PDF into context for routine prompts.

## Step 1: Assessment and Candidate Matching

For every new job-description prompt:

1. Parse the requested job title and any stated work context, duties, department, seniority, supervisory scope, technical domain, regulatory authority, and deliverables.
2. Read `resources_index.md` first.
3. Identify likely occupational group/classification candidates from the JES index and pay-scale coverage.
4. For the most plausible candidates, inspect the relevant JES PDFs only. Extract enough text to validate group fit and level factors.
5. Produce a concise assessment with a range of options, normally 3 to 5 candidates unless fewer are defensible.
6. Include a confidence rating for each candidate as a percentage and a short rationale.
7. State what additional details would improve confidence, but do not block unless classification would be irresponsible without them.
8. Ask the user to select one candidate before proceeding.

The Step 1 response must include:

- `Interpreted role`: the inferred job being requested.
- `Candidate matches`: classification group/level candidate, confidence rating, rationale, JES file used or needed, and pay-scale availability.
- `Recommended selection`: the best candidate if the user wants to proceed.
- `User action required`: ask the user to choose one option.

If the most likely occupational group appears in `payscales.json` but no matching JES PDF is present, disclose that resource gap. Offer the closest JES-backed alternatives, but do not pretend a missing JES was reviewed.

## Step 2: Completed Job Description

Proceed only after the user selects a candidate classification option.

In Step 2:

1. Read `resources/template.md`.
2. Read the selected JES PDF and any directly relevant benchmark/level sections.
3. Read `resources/payscales.json` and select the latest effective-dated pay agreement for the selected group and level.
4. Use `resources/job description writing guide.md` for the content expectations under organizational context, client service results, key activities, skill, effort, responsibility, and working conditions.
5. Use `resources/directive_on_classification.md` to ensure required classification documentation fields and references are included.
6. Use `resources/national_occupational_classification.md` for NOC context where enough information exists; if not enough information exists, mark the NOC field as `To be confirmed`.
7. Complete all possible fields in the template. Where the prompt lacks organization-specific facts, use `To be confirmed` rather than inventing facts.
8. Include a classification recommendation section in the completed template that explains group/level rationale and pay scale.
9. Include a references section listing all local files used, including exact JES PDF filenames and resource Markdown/JSON files.
10. Include a note that the output is AI-assisted draft advice and that formal classification decisions must be made by appropriately delegated/accredited classification authorities.

## Output File Requirements

Write the completed job description to the repository root with this filename pattern:

```text
job_description_<role_slug>_<YYYY-MM-DD>.md
```

Use the current local date for `<YYYY-MM-DD>`. After writing the file, display it on screen by reading the file into the terminal, for example:

```bash
sed -n '1,260p' job_description_economic_analyst_2026-05-05.md
```

If the file is longer than the first read window, continue reading until the full document has been displayed.

## Pay Scale Requirements

For pay:

- Match `group` and `level` from `resources/payscales.json`.
- Use the latest `effectiveDate` within the matching record unless the user asks for a different date.
- Report all available steps and amounts for that latest effective date.
- If no exact pay-scale record exists, disclose the gap and do not estimate salary.

## Quality Rules

- Use plain, bias-free language.
- Keep duties tied to work actually implied by the prompt and selected classification.
- Do not overstate authority, supervisory responsibility, financial delegation, scientific independence, or regulatory decision-making unless the user supplied those facts or they are intrinsic to the selected JES level.
- Distinguish evidence from inference.
- Prefer `To be confirmed` for missing administrative details.
- Always cite local resource filenames in the output.
