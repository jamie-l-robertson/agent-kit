---
name: sync-project-skills
description: >-
  Inventory kit vs project-owned skills under .claude/skills.
  Updates AGENTS.md Skills line and .claude/memory/skills-inventory.md. Invoked by
  setup / after adding project skills when the Skills line looks stale.
x-owner: agent-kit
---

# Sync project skills inventory

Non-destructive: never deletes skill directories. Classifies **kit** vs **project** skills.

## When to run

Setup **always** runs this (see setup skill). Also run after adding/removing a project-owned skill, or when `AGENTS.md` **Skills** / `.claude/memory/skills-inventory.md` looks stale.

## Command

```bash
node scripts/sync-project-skills.mjs
# optional drift check:
node scripts/sync-project-skills.mjs --check
```

Edit kit skills under `.claude/skills/` directly (single tree).
