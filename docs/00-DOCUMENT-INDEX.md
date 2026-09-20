# 00. Document Index

The full document set for building, running and handing over this application.
Standard SDLC structure — reusable as a template for any app.

## Which document answers which question

| # | Document | Answers | Primary reader |
|---|---|---|---|
| 00 | Document Index | What exists and where | Everyone |
| 01 | **BRD** — Business Requirements | *Why* build this? What is the business case? | Sponsor, stakeholders |
| 02 | **PRD** — Product Requirements | *What* should it do? Goals and non-goals | Product, engineering |
| 03 | **SRS** — Functional Spec | *Exactly* what, with acceptance criteria | Engineering, QA |
| 04 | **Architecture** (SDD) | *How* is it built? Components and flow | Engineering |
| 05 | **Data Model** | What data, what shape, what units | Engineering, analytics |
| 06 | **API Spec** | Every endpoint, auth, contracts, dead ends | Engineering |
| 07 | **Design System / UX** | Look, feel, components, responsive, PWA | Design, front-end |
| 08 | **Security & Compliance** | Threats, regulation, data handling | Engineering, legal |
| 09 | **SDLC Process** | Branching, review, definition of done, release | Engineering |
| 10 | **Test Plan** | What is tested and how | QA, engineering |
| 11 | **Deployment Runbook** | Deploy, verify, roll back | DevOps |
| 12 | **Maintenance & Support** | Monitoring, on-call, routine upkeep | Operations |
| 13 | **Risk Register** | What could go wrong, and the mitigation | PM, sponsor |
| 14 | **ADR** — Decision Records | Why key decisions were made | Engineering (future) |
| 15 | **Roadmap & Backlog** | What is next, prioritised | Product |
| 16 | **User Manual** | How an end user uses it | End users |
| 17 | **Changelog** | What changed, when | Everyone |

## Reading order by role

**New developer joining:** 02 → 04 → 06 → 09 → 03
**Doing a code change:** 09 → 03 → 10 → 11
**Debugging production:** 11 → 12 → 06 (dead ends section)
**Understanding a past decision:** 14 → 01
**Non-technical stakeholder:** 01 → 02 → 16

## Document conventions

- Requirements are numbered `BR-n` (business), `FR-n` (functional), `NFR-n` (non-functional)
  so they can be traced from BRD → PRD → SRS → test case.
- Every "we cannot do X" statement names the evidence. Unverified assumptions are labelled
  as assumptions, not facts.
- Decisions that look like gaps are recorded in the ADR with their reasoning, so a future
  engineer does not "fix" them by accident.
