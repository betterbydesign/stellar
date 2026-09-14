# <PRD title>

Copy this file into `documentation.artifacts.prds` and fill every section. Delete a section only when it genuinely does not apply, and say why in Overview rather than leaving it blank. Keep acceptance criteria here or link to the current user request. Do not invent an external task ID or tracker structure.

## Overview

What this work is and the outcome it should produce, in a short paragraph.

## Prerequisites

- Work that must be complete first
- Accounts, services, or access required
- Dependencies

## User Stories

- As a `<user>`, I want to `<action>` so that `<benefit>`.

## Technical Requirements

### Endpoints and routes

Route specifications, request and response shapes, authentication requirements.

### Interface

Component or template hierarchy, state, and the user interactions each surface supports.

### Data model

Schema or content-model changes, and the committed artifact each one obliges an update to.

### Integrations

External service connections, configuration, and authentication flows.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Testing Plan

What is covered at each level, and what is deliberately left to manual verification.

## Rollback Plan

How to revert the change safely. Describe deployment rollback only when a deployment mechanism is configured.

## Timeline

Sequenced breakdown, with the first shippable slice named.

## Dependencies On Other Work

- What must be complete before this starts
- What this enables afterwards
