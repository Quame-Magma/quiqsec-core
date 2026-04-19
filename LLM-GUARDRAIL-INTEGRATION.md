# LLM Guardrail Integration (Hybrid Design)

This document describes how to add an optional LLM behind QuiqSec prompt interception while preserving deterministic security enforcement.

## Current Baseline

Today, prompt interception is deterministic:
- classify prompt by keyword packs
- inject base and pack-specific security policies
- return a rewritten prompt with security requirements
- verify generated code against category controls

This baseline must remain the guaranteed fallback path.

## Why Add an LLM

An optional LLM layer can improve:
- semantic intent detection for prompts that do not contain direct keywords
- policy selection relevance for mixed or ambiguous tasks
- rewrite quality and reduced instruction noise

## Risks And Constraints

LLM augmentation introduces:
- latency
- request cost
- non-determinism
- possible data exposure if a remote provider is used

Mitigations:
- hard timeout
- strict schema validation
- deterministic fallback on any failure
- redaction before provider calls
- feature flag defaults to disabled

## Recommended Architecture

1. Keep deterministic classifier and policy packs as source of truth.
2. Add optional `llmSuggestGuardrails(prompt)` stage that returns structured JSON only.
3. Validate output with strict schema.
4. Intersect suggested controls with allowlisted policy/control IDs.
5. Merge results into final policy list.
6. Return explainability metadata (selected controls and reason source).

## Rollout Plan

1. Shadow mode
- call LLM, but do not change effective output
- log comparison metrics against deterministic selection

2. Hybrid mode
- deterministic policies always included
- LLM suggestions can add allowlisted policies

3. Confidence tuning
- increase/decrease LLM influence based on observed precision and recall

## Operational Flags

Proposed config fields:
- `llm.enabled`
- `llm.provider`
- `llm.model`
- `llm.timeoutMs`
- `llm.mode` (`shadow` | `augment`)

## Acceptance Criteria

- Deterministic fallback works when provider is unavailable.
- Invalid LLM responses never break MCP interception.
- P95 interception latency remains within agreed budget.
- Prompt rewrite stays explainable and auditable.
