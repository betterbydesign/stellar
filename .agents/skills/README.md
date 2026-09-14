# Skills

A skill body lives **once**, here, in `.agents/skills/<skill-name>/`. Every agent host
directory holds a **relative** symlink to it:

```bash
mkdir -p .agents/skills/<skill-name>   # author SKILL.md inside it
mkdir -p .cursor/skills .claude/skills
ln -s ../../.agents/skills/<skill-name> .cursor/skills/<skill-name>
ln -s ../../.agents/skills/<skill-name> .claude/skills/<skill-name>
```

One body, many hosts, no drift — the thin-adapter principle applied to skills. Relative,
not absolute: an absolute symlink breaks in every checkout but the one it was made in. A
real directory under a host path instead of a symlink is drift, and the drift check fails
on it, because this is easy to violate by accident and the copies diverge silently once
it happens.

Every **vendored** skill — anything whose body came from outside this repo — also gets an
entry in `skills-lock.json` recording its source, source type, path, and a content hash.
The drift check enforces both halves: each directory here has a lock entry, and each host
skills path is a symlink. The lock file therefore ships present and empty
(`{"version": 1, "skills": {}}`), so the first unpinned vendored skill is visible
immediately rather than landing unnoticed.

## Skill store scope

**Each repo keeps its own lockfile pinning skills from a shared upstream source**, rather
than the project sharing one lockfile across its repos — the repos need disjoint skill
sets, and a shared lockfile would force each one to carry, review, and churn on the
other's tooling.
