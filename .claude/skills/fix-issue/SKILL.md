---
name: fix-issue
description: Fix a GitHub issue end-to-end
user_invocable: true
arguments:
  - name: number
    description: "GitHub issue number"
    required: true
---

# Fix GitHub Issue Workflow

You are fixing GitHub issue **#$ARGUMENTS.number**.

## Steps

### 1. Understand
- Fetch issue details: `gh issue view $ARGUMENTS.number`
- Read related code and understand the root cause
- If the issue is unclear, ask the user for clarification

### 2. Branch
- Create a fix branch: `feature/fix-$ARGUMENTS.number`
- `git checkout -b feature/fix-$ARGUMENTS.number`

### 3. Fix
- Implement the minimal fix
- Add or update tests to cover the bug
- Run typecheck + lint after changes

### 4. Verify
- Run the full quality suite:
  ```
  cd apps/web
  npm run typecheck
  npm run lint
  npm run test
  ```
- All must pass

### 5. PR
- Commit with message: `fix: <description> (closes #$ARGUMENTS.number)`
- Push and create PR: `gh pr create`
- Link the issue in the PR body
- Report the PR URL
