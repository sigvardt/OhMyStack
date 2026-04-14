# OhMyStack Agent Dispatch Patterns

This document defines how OhMyStack skills dispatch OMO named agents. All skill rewrites in Wave 4 must follow these patterns.

## Agent Name → subagent_type Mapping Table

| Agent Name | subagent_type | Use Case | Background? |
|---|---|---|---|
| Explore | explore | Codebase grep, pattern discovery | YES (always) |
| Librarian | librarian | External docs, OSS examples, library APIs | YES (always) |
| Metis | metis | Pre-planning gap analysis | NO (sync, blocking) |
| Momus | momus | Adversarial plan/code critique | NO (sync, blocking) |
| Oracle | oracle | Architecture, debugging, strategic review | NO (sync, blocking) |
| Sisyphus-Junior | category dispatch | Focused task execution | NO (sync, blocking) |

## Pattern Categories

### Planning Skills Pattern
**Skills:** plan-ceo-review, plan-eng-review, plan-design-review, plan-devex-review, office-hours

1. Spawn Explore agents (background) for codebase research
2. Spawn Librarian agent (background) for documentation lookup
3. Synthesize findings into structured analysis
4. Invoke Metis (sync) for gap analysis on the draft plan
5. If high accuracy requested: invoke Momus (sync) for adversarial review, loop until OKAY
6. Invoke Oracle (sync) for strategic/architectural verification

```typescript
// Background exploration
task(subagent_type="explore", load_skills=[], prompt="[CONTEXT]...[GOAL]...[REQUEST]...", run_in_background=true)
task(subagent_type="librarian", load_skills=[], prompt="...", run_in_background=true)

// Sync gap analysis
task(subagent_type="metis", load_skills=[], prompt="Analyze this plan for gaps: ...", run_in_background=false)

// Sync adversarial review (loop until OKAY)
task(subagent_type="momus", load_skills=[], prompt="Review this plan: ...", run_in_background=false)
// If REJECT → fix issues → resubmit with session_id
```

### Research Skills Pattern
**Skills:** investigate, cso, learn

1. Identify investigation targets
2. Spawn 3-5 Explore agents in parallel (background) with different search angles
3. Optionally spawn Librarian for external docs
4. Collect all results, deduplicate findings
5. Synthesize into actionable output

### Review Skills Pattern
**Skills:** review, design-review, health, design-consultation, design-html, design-shotgun

1. Read the diff/code under review
2. Spawn parallel review agents:
   - Oracle: structural quality, architecture compliance
   - Momus: adversarial critique, edge case identification
   - Explore: verify referenced files exist, check test coverage
3. Aggregate verdicts into unified APPROVE/REJECT with specifics

### QA Skills Pattern
**Skills:** qa, qa-only, benchmark, devex-review

1. Identify test targets from codebase
2. Spawn Explore agents to map testable surfaces
3. Execute QA scenarios
4. For each failure: categorize severity, capture evidence
5. If fix mode: dispatch fix to Sisyphus-Junior per bug

```typescript
// Sisyphus-Junior dispatch example
task(category="quick", load_skills=["skill-name"], prompt="Fix: ...", run_in_background=false)
```

### Workflow Skills Pattern
**Skills:** ship, retro, document-release, land-and-deploy, canary

1. Pre-flight checks (git status, tests pass)
2. Dispatch verification agents in parallel before action
3. Execute workflow steps sequentially with gates
4. Post-action verification via agent dispatch

## Authoritative task() API Contract

```typescript
// Background agent dispatch (parallel exploration)
task(subagent_type="explore", load_skills=[], prompt="...", run_in_background=true)
task(subagent_type="librarian", load_skills=[], prompt="...", run_in_background=true)

// Sync agent dispatch (blocking, for review gates)
task(subagent_type="metis", load_skills=[], prompt="...", run_in_background=false)
task(subagent_type="momus", load_skills=[], prompt="...", run_in_background=false)
task(subagent_type="oracle", load_skills=[], prompt="...", run_in_background=false)

// Category-based dispatch (for focused task execution)
task(category="quick", load_skills=["skill-name"], prompt="...", run_in_background=false)
task(category="deep", load_skills=[], prompt="...", run_in_background=false)
task(category="visual-engineering", load_skills=["frontend-ui-ux"], prompt="...", run_in_background=false)
```

## Session Continuity Pattern

Use `session_id` to maintain context when re-engaging an agent after addressing feedback.

```typescript
// First invocation
result = task(subagent_type="momus", ..., run_in_background=false)

// If REJECT:
task(session_id=result.session_id, ..., prompt="Fix: ...", run_in_background=false)
```
