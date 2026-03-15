# Real-world demo data sources

This dataset is intended to make local product testing more realistic without depending on proprietary customer data.

## Source set

### NIST AI RMF
- Title: `Artificial Intelligence Risk Management Framework (AI RMF 1.0)`
- URL: `https://www.nist.gov/itl/ai-risk-management-framework`
- Purpose in the seed:
  - governance, mapping, measurement, and management framing
  - decision-trace references
  - control and telemetry scenario grounding

### NIST AI RMF Playbook
- Title: `NIST AI RMF Playbook`
- URL: `https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook`
- Purpose in the seed:
  - operational playbook references for risk handling and measurement
  - clinical and safety monitoring examples

### EU AI Act
- Title: `Regulation (EU) 2024/1689`
- URL: `https://eur-lex.europa.eu/eli/reg/2024/1689/`
- Purpose in the seed:
  - high-risk scenario grounding for:
    - credit eligibility / access to essential private services
    - employment / candidate screening
    - safety-critical clinical support

### OECD AI Incidents Monitor
- Title: `OECD AI Incidents Monitor`
- URL: `https://oecd.ai/en/incidents/`
- Methodology: `https://oecd.ai/en/incidents-methodology`
- Purpose in the seed:
  - incident taxonomy inspiration
  - bias, reliability, and safety escalation examples
  - post-incident review structure

### FDA AI-enabled medical devices
- Title: `Artificial Intelligence-Enabled Medical Devices`
- URL: `https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices`
- Purpose in the seed:
  - healthcare safety-monitoring and imaging workflow grounding
  - clinical governance and device-adjacent oversight examples

### CISA roadmap for AI
- Title: `CISA Roadmap for Artificial Intelligence`
- URL: `https://www.cisa.gov/sites/default/files/2023-11/2023-2024_CISA-Roadmap-for-AI_508c.pdf`
- Purpose in the seed:
  - critical-infrastructure governance scenarios
  - resilience and operational-risk framing for utility workflows

### UNESCO guidance for generative AI in education
- Title: `Guidance for generative AI in education and research`
- URL: `https://www.unesco.org/en/digital-education/ai-future-learning/guidance`
- Purpose in the seed:
  - student-support and admissions workflow grounding
  - human oversight and fairness framing for education use cases

### EEOC AI and algorithmic fairness initiative
- Title: `EEOC launches initiative on AI and algorithmic fairness`
- URL: `https://www.eeoc.gov/newsroom/eeoc-launches-initiative-artificial-intelligence-and-algorithmic-fairness`
- Purpose in the seed:
  - employment-risk and bias scenario framing
  - override and fairness-review posture for hiring use cases

## Seeded scenarios

### Northstar Consumer Bank Demo
- Credit eligibility decision engine
- Collections hardship assistant
- Retail support resolution copilot
- Invoice extraction copilot

### HarborView Diagnostics Demo
- Mammography triage model
- Clinical documentation summarizer

### Meridian Talent Systems Demo
- Candidate screening ranker
- Interview scheduling assistant
- Skills taxonomy matcher

### Silverline Insurance Operations Demo
- Catastrophe claims severity triage
- Policy servicing assistant

### GridReliant Utilities Demo
- Vegetation outage risk forecaster
- Outage communications copilot

### Summit Education Services Demo
- Scholarship eligibility support model
- Admissions document review copilot

## What the dataset is meant to exercise
- portfolio control
- registry and system detail views
- risk assessments
- approval tiers 1, 2, and 3
- decision traces and outcome tracking
- incidents and postmortems
- telemetry thresholding and escalation
- retention, legal hold, and audit-chain verification
- org admin pages:
  - domains
  - invites
  - billing
  - telemetry policy
  - telemetry adapter
  - integrations

## Current seeded coverage
- 6 demo organizations
- 15 AI systems
- 15 workflows
- 7 decision traces
- 7 manual incidents plus telemetry-driven incident escalation
- 9 telemetry events
- multi-sector demo coverage:
  - banking
  - healthcare
  - hiring
  - insurance
  - utilities
  - education

## Notes
- This is a curated demo dataset based on public governance frameworks and public incident-monitoring references.
- It is realistic in structure and scenario design, but it is not intended to claim that the seeded organizations are real customers.
- Domains use `.example`-style safe placeholders.
