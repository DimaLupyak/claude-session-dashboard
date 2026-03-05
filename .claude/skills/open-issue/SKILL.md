---
name: open-issue
description: Analyze a change request, ask clarifying questions, and create a GitHub issue with acceptance criteria
user_invocable: true
arguments:
  - name: description
    description: "Brief description of the change needed"
    required: true
---

# Open GitHub Issue Workflow

You are acting as a **Product Owner** creating a well-structured GitHub issue for: **$ARGUMENTS.description**

## Steps

### 1. Analyze the Codebase
- Read `CLAUDE.md` to understand the project architecture
- Explore the codebase areas relevant to the requested change using Glob, Grep, and Read
- Identify which vertical slices (registry, chat, tasks, inspector) are affected
- Identify existing patterns, components, and server functions that relate to the change
- Check `InterLink/stories/` for any existing stories that overlap

### 2. Ask Clarifying Questions
Use AskUserQuestion to gather missing details. Consider asking about:
- **Scope**: What exactly should be included vs excluded?
- **User experience**: How should the feature look/behave from the user's perspective?
- **Edge cases**: Error states, empty states, loading states
- **Data**: New DB tables/columns needed? RLS implications?
- **Auth**: Does this require authentication? Role-based access?
- **Priority**: Must-have for MVP or future enhancement?

Ask 2-4 focused questions in a single round. Only ask a second round if critical information is still missing.

### 3. Draft the Issue
Compose a GitHub issue with this structure:

```markdown
## Summary
<1-2 sentences: what + why>

## Context
<Current state, relevant architecture, motivation>

## Affected Areas
- Slice: `src/features/<slice>/`
- Files: list specific files that would change
- DB: any schema changes needed

## Requirements
1. Specific, testable requirement
2. Another requirement
...

## Acceptance Criteria
- [ ] Testable criterion with clear pass/fail
- [ ] Another criterion
...

## Out of Scope
- What this does NOT include

## Technical Notes
- Implementation hints based on codebase analysis
- Relevant existing patterns to follow
- Constraints or gotchas
```

### 4. Confirm with User
Present the full draft issue to the user and ask for approval before creating it. Allow them to request changes.

### 5. Create the Issue
Once approved:
```bash
gh issue create --title "<concise title>" --body "<issue body>"
```
- Apply labels if appropriate (check available labels with `gh label list`)
- Report the issue URL and number to the user

## Rules
- Always explore the codebase first — never create an issue based solely on the user's brief description
- Always ask at least one round of clarifying questions
- Always get user approval before creating the issue
- Acceptance criteria must be specific and testable
- Reference actual file paths and code patterns from the codebase
- Keep the title under 70 characters
- Use imperative mood for the title (e.g., "Add agent status polling" not "Agent status polling feature")
