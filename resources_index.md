# Compact Resource Index

This index minimizes context use for job-description prompts. Start here, then open only the specific source files needed for the selected candidate.

## Required Workflow Summary

- First response to a job prompt: assess the prompt, propose candidate classification matches, provide confidence ratings, cite likely JES/resource files, and ask the user to select an option.
- Second response after selection: complete `resources/template.md`, write a date-stamped Markdown file in the repo root, display the full file in the terminal, include pay scale from `resources/payscales.json`, and list all local sources used.

## Core Resources

| File | Use |
| --- | --- |
| `resources/template.md` | Mandatory job description format. Contains position information/signatures and Part 2 headings: organizational context, client service results, key activities, skill, effort, responsibility, working conditions. |
| `resources/payscales.json` | Classification pay data. Match by `group` and `level`; use the latest `effectiveDate`; report all rate steps. |
| `resources/directive_on_classification.md` | Classification governance. Requires jobs to be classified using directives, JES, occupational definitions, and guidance; job descriptions must be concise, bias-free, complete, signed/dateable, and include classification/NOC/effective date/organization fields. |
| `resources/job description writing guide.md` | Drafting guidance. Use for structure and content expectations for client service results, key activities, skill, effort, responsibility, working conditions, inclusive language, and effective dates. |
| `resources/policy_on_people_management.md` | Governance context. Deputy heads ensure appropriate compensation, organizational design, classification relativity, and access to accredited classification advice. |
| `resources/directive_on_automated_decision_making.md` | AI-assisted workflow context. Emphasizes transparency, documentation, testing/monitoring, human involvement, and explainability where automated systems assist decisions. |
| `resources/guide_on_the_use_of_generative_artificial_intelligence.md` | Responsible generative AI use context. Use to frame output as an AI-assisted draft requiring human review. |
| `resources/national_occupational_classification.md` | NOC context. Use for NOC field support where enough role information exists; otherwise mark NOC as `To be confirmed`. |

## Pay-Scale Coverage

`resources/payscales.json` contains 360 records across these groups and levels:

| Group | Levels in pay file |
| --- | --- |
| AC | 1, 2, 3 |
| AG | 1, 2, 3, 4, 5 |
| AI | 1, 2, 3, 4, 5, 6, 7 |
| AR | 1, 2, 3, 4, 5, 6, 7 |
| AS | AS-1 to AS-8; also legacy/crosswalk entries for CM, CR, Development |
| AU | 1, 2, 3, 4, 5, 6 |
| BI | 1, 2, 3, 4, 5 |
| CAI | 1, 2, 3, 4, 5 |
| CH | 1, 2, 3, 4, 5 |
| CO | 01, 02, 03, 04, DEV |
| CR | CR-3 to CR-7; also DA-CON crosswalk entries |
| CS | 1, 2, 3, 4, 5 |
| CX | 1, 2, 3 |
| DA-CON | multiple DA/IS crosswalk entries and Special level C |
| DD | 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| DS | 1, 2, 3, 4, 5, 6, 7 |
| EC | 1, 2, 3, 4, 5, 6, 7, 8 |
| EG | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |
| EL | 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| EN-ENG | 1, 2, 3, 4, 5, 6 |
| EN-SUR | 1, 2, 3, 4, 5, 6 |
| ETP | 1 |
| FB | 1, 2, 3, 4, 5, 6, 7, 8 |
| FI | 1, 2, 3, 4, Development |
| FO | 1, 2, 3, 4 |
| FS | 1, 2, 3, 4 |
| GT | 1, 2, 3, 4, 5, 6, 7, 8 |
| HPS | 1, 2 |
| HR | 1, 2, 3, 4, 5 |
| MA | 1, 2, 3, 4, 5, 6, 7 |
| MT | 1, 2, 3, 4, 5, 6, 7 |
| OE-BEO/OE-CEO/OE-DEO/OE-MEO/OE-MSE | office equipment subgroup levels |
| PC | 1, 2, 3, 4, 5 |
| PG | 01, 2, 3, 4, 5, 6 |
| PI-1 to PI-7 | CGC entries |
| PM | 1, 2, 3, 4, 5, 6, 7, Development |
| PY | 1, 2, 3, 4, 5, 6, 7 |
| RO | 0, 1, 2, 3, 4, 4 Instructor, 5, 6 |
| SE-REM | 1, 2 |
| SE-RES | 1, 2, 3, 4, 5 |
| SG-PAT | 1, 2, 3, 4, 5, 6, 7 |
| SG-SRE | 1, 2, 3, 4, 5, 6, 7, 8 |
| ST-COR/ST-OCE/ST-SCY/ST-STN/ST-TYP | secretarial/stenographic/typing subgroup levels |
| TI | 1, 2, 3, 4, 5, 6, 7, 8 |
| TR | 1, 2, 3, 4, 5 |
| UT | 1, 2, 3, 4 |
| WP | 1, 2, 3, 4, 5, 6 |

Note: `EC` pay exists, but no `EC - Economics and Social Science Services` JES PDF is present in `resources/JES`. For economic/social science analyst roles, disclose this gap and avoid claiming JES-backed EC validation unless the EC standard is added.

## JES Routing Index

Use file names and keywords below to identify candidate JES files. Open only candidate PDFs.

| Group | JES file | Use for prompts involving |
| --- | --- | --- |
| AC | `resources/JES/AC - Actuarial Science - Job Evaluation Standard.pdf` | actuarial analysis, insurance valuations, pensions, actuarial reserves, risk tables |
| AG | `resources/JES/AG - Agriculture - Job Evaluation Standard.pdf` | agriculture science, crops, livestock, agri-food research, agricultural programs requiring professional science |
| AI | `resources/JES/AI - Air Traffic Control - Job Evaluation Standard.pdf` | air traffic control, flight service operations, operational aviation traffic safety |
| AO | `resources/JES/AO - Aircraft Operations - Job Evaluation Standard.pdf` | aircraft operations, pilot inspection, civil aviation inspection, test pilots, helicopter pilots |
| AR | `resources/JES/AR - Architecture and Town Planning - Job Evaluation Standard.pdf` | architecture, urban planning, town planning, built environment professional design |
| AS | `resources/JES/AS - Administrative Services - Job Evaluation Standard.pdf` | administrative services, management support, planning, coordination, internal services, business administration |
| BI | `resources/JES/BI - Biological Sciences - Job Evaluation Standard.pdf` | biology, ecology, biological research, wildlife, environmental biology, laboratory or field biological science |
| CH | `resources/JES/CH - Chemistry - Job Evaluation Standard.pdf` | chemistry, laboratory chemistry, chemical analysis, analytical methods, chemical research |
| CM | `resources/JES/CM - Communications - Job Evaluation Standard.pdf` | communications production/support, public communications processes, writing/editing/communications support where not IS |
| CO | `resources/JES/CO - Commerce - Job Evaluation Standard.pdf` | commerce, business development, industrial development, trade, investment, market/commercial analysis |
| CR | `resources/JES/CR - Clerical and Regulatory - Job Evaluation Standard.pdf` | clerical processing, regulatory clerical work, records, forms, client transactions, routine regulatory administration |
| CX | `resources/JES/CX - Correctional Services - Job Evaluation Standard.pdf` | correctional officer work, institutional security, offender supervision |
| DA | `resources/JES/DA - Data Processing - Job Evaluation Standard.pdf` | data conversion, data production, data processing operations, legacy data processing support |
| DD | `resources/JES/DD - Drafting and Illustration - Job Evaluation Standard.pdf` | drafting, technical illustration, maps, engineering drawings, graphic technical plans |
| DE | `resources/JES/DE - Dentistry - Job Evaluation Standard.pdf` | dental professional work, dentistry, oral health services |
| DS | `resources/JES/DS - Defense Scientific Service - Job Evaluation Standard.pdf` | defence science, military/defence scientific analysis, defence research |
| EG | `resources/JES/EG - Engineering and Scientific Support - Job Evaluation Standard.pdf` | technical support for engineering/science, inspections, testing, field/lab support, technical analysis below professional science/engineering |
| EL | `resources/JES/EL - Electronics - Job Evaluation Standard.pdf` | electronics systems, telecommunications equipment, radio/electronic maintenance, electronic technical work |
| EN-ENG | `resources/JES/EN-ENG - Engineering and land survey - Engineering sub-group - Job Evaluation Standard.pdf` | professional engineering, engineering design, engineering project authority, engineering analysis |
| EN-SUR | `resources/JES/EN-SUR - Engineering and land survey - Land survey sub-group - Job Evaluation Standard.pdf` | land survey, geodetic survey, cadastral survey, professional survey authority |
| EU | `resources/JES/EU - Educational Support - Job Evaluation Standard.pdf` | educational support, classroom/lab education assistance, training delivery support |
| FO | `resources/JES/FO - Forestry - Job Evaluation Standard.pdf` | professional forestry, forest management, silviculture, forest science |
| FR | `resources/JES/FR - Firefighters - Job Evaluation Standard.pdf` | firefighting operations, fire chiefs, emergency response fire services |
| GL | `resources/JES/GL - General Labour and Trades - Job Evaluation Standard.pdf` | trades, maintenance, repair, labour, construction, equipment operation trades |
| GS | `resources/JES/GS - General Services - Job Evaluation Standard.pdf` | operational services, custodial, food, stores, messenger, general support services |
| GT | `resources/JES/GT - General Technical - Job Evaluation Standard.pdf` | general technical work not covered by specific technical groups, technical inspection/support, applied technical operations |
| HP | `resources/JES/HP - Heating, Power and Stationary Plan Operation - Job Evaluation Standard.pdf` | heating plant, power plant, stationary engineer, boiler/refrigeration plant operations |
| HR | `resources/JES/HR - Historical Research - Job Evaluation Standard.pdf` | historical research, archival/historical analysis, heritage historical studies |
| IS | `resources/JES/IS - Information Services - Job Evaluation Standard.pdf` | public information, media relations, communications advisory, publishing/public affairs strategy |
| LI | `resources/JES/LI - Lightkeepers - Job Evaluation Standard.pdf` | lighthouse operations, lightkeeper duties, marine navigational aid stations |
| LS | `resources/JES/LS - Library Science - Job Evaluation Standard.pdf` | professional library science, cataloguing, reference, collections, library management |
| MA | `resources/JES/MA - Mathematics - Job Evaluation Standard.pdf` | mathematics, statistics, statistical methods, modelling, quantitative methods |
| MD | `resources/JES/MD - Medecine - Job Evaluation Standard.pdf` | medicine, medical officer, medical specialist, physician work |
| OE | `resources/JES/OE - Office Equipment - Job Evaluation Standard.pdf` | office equipment operation, duplicating, mail equipment, bookkeeping/calculating equipment |
| OM | `resources/JES/OM - Organization and Methods - Job Evaluation Standard.pdf` | organization and methods, work study, process improvement, administrative systems analysis |
| OP | `resources/JES/OP - Occupational and Physical Therapy - Job Evaluation Standard.pdf` | occupational therapy, physical therapy, rehabilitation professional services |
| PC | `resources/JES/PC - Physical Sciences - Job Evaluation Standard.pdf` | physical sciences, geology, meteorology, oceanography, physics, environmental physical science |
| PE | `resources/JES/PE - Personnel Administration - Job Evaluation Standard.pdf` | HR/personnel administration, staffing, classification, labour relations, compensation advisory |
| PG | `resources/JES/PG - Purchase and Supply - Job Evaluation Standard.pdf` | procurement, contracting, materiel management, purchasing, supply chain |
| PH | `resources/JES/PH - Pharmacy - Job Evaluation Standard.pdf` | pharmacy, dispensing, pharmaceutical advisory/regulatory functions |
| PI | `resources/JES/PI - Primary Products Inspection - Job Evaluation Standard.pdf` | inspection of primary products, agricultural/food/fish/grain inspection |
| PM | `resources/JES/PM - Programme Administration - Job Evaluation Standard.pdf` | program administration, service delivery, benefits/grants/contributions, case/program operations, mediation/conciliation |
| PR | `resources/JES/PR - Printing Services - Job Evaluation Standard.pdf` | printing operations, print production, bindery, press operations |
| PY | `resources/JES/PY - Photography - Job Evaluation Standard.pdf` | photography, imaging, photographic production, photo lab/field work |
| RO | `resources/JES/RO - Radio Operations - Job Evaluation Standard.pdf` | radio operations, marine/aviation radio, communications operations |
| SC | `resources/JES/SC - Ships' Crew - Job Evaluation Standard.pdf` | ships crew, deck/engine room operational marine work |
| SE | `resources/JES/SE - Scientific Research - Job Evaluation Standard.pdf` | research scientist, research manager, independent scientific research |
| SG | `resources/JES/SG - Scientific Regulation - Job Evaluation Standard.pdf` | scientific regulation, patents, regulatory science evaluation, scientific review for compliance/approval |
| SO | `resources/JES/SO - Ship's Officers - Job Evaluation Standard.pdf` | ship officers, masters, mates, marine engineering officers |
| SR | `resources/JES/SR - Ship Repair - Job Evaluation Standard (1).pdf` | ship repair trades, naval repair, dockyard repair operations |
| ST | `resources/JES/ST - Secretarial, Stenographic, Typing - Job Evaluation Standard.pdf` | secretarial, stenographic, typing, court reporting, office composing equipment |
| TI | `resources/JES/TI - Technical Inspection - Job Evaluation Standard.pdf` | technical inspection, quality assurance inspection, standards compliance inspection |
| TR | `resources/JES/TR - Translation - Job Evaluation Standard.pdf` | translation, interpretation, terminology services |
| UT | `resources/JES/UT - University Teaching - Job Evaluation Standard.pdf` | university teaching, lecturer, assistant/associate professor, professor, dean/head duties |
| VM | `resources/JES/VM - Veterinary Medicine - Job Evaluation Standard.pdf` | veterinary medicine, animal health professional work, veterinary inspection/advisory work |

## Common Prompt-to-Candidate Hints

| Prompt terms | Candidate groups to inspect |
| --- | --- |
| economic analyst, policy analyst, socio-economic research, labour market analysis | EC pay exists but no EC JES present; consider CO for commercial/economic development, PM for program policy/administration, MA for statistical/mathematical methods, AS for administrative analysis |
| data analyst | CS if IT systems/data engineering, MA if statistical methods, EC if socio-economic analytics but JES missing, AS/PM if business/program reporting |
| procurement officer | PG primary; AS only if mainly administrative support |
| program officer | PM primary; AS if internal administrative coordination; CO if business/commercial program delivery |
| communications advisor | IS primary; CM if communications support/production |
| HR advisor | PE primary; AS only for generic administration |
| scientist/researcher | SE for independent research, BI/CH/PC/AG/FO/HR/MA/DS/SG depending scientific domain |
| engineer | EN-ENG for professional engineering, EG/GT for technical support |
| regulatory inspector | TI/PI/SG/EG depending whether inspection is technical, primary-products, scientific regulation, or engineering/scientific support |
