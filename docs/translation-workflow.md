# Festify - CrowdTune Clean-Room Translation Workflow

CrowdTune is licensed under the Sustainable Use License v1.0. Festify, our reference clone, is licensed under
LGPLv3. **Direct copying of Festify code into this repo would taint the license.** This document describes the
clean-room workflow that lets us learn from Festify's behavior without inheriting its license.

## The two-agent firewall

Translation always uses **two agents in series**, never one:

```
.reference/festify/<file>            docs/specs/<file>.spec.md         apps/...
        |                                    ^                              ^
        |                                    |                              |
        +--- festify-translator -------------+                              |
              (reads source, writes prose)                                  |
                                             +-- react-component-author ----+
                                                  or gin-handler-author
                                                  (reads ONLY the spec, writes code)
```

- The **festify-translator** is the only agent allowed to read `.reference/festify/`.
- The **react-component-author** and **gin-handler-author** are forbidden from reading `.reference/`.
- The contract between them is the prose-only spec at `docs/specs/<file>.spec.md`. No code, no transcribed
  algorithms, no quoted identifiers beyond domain words.

This mirrors the historical clean-room reverse-engineering pattern (Phoenix BIOS, ReactOS) that has held up
in practice.

## When to use the workflow

Use it for: every Festify component or function whose behavior we want to preserve in CrowdTune.

Do NOT use it for: features that are CrowdTune-original (pay-per-track, PromptPay, food ordering, our own
restaurant operator dashboard). Those go straight from the user request to the implementer agents.

## Step-by-step

### Step 1 - Pick the next port target

Look at `.reference/festify/src/` (the Polymer components) or `.reference/festify/functions/` (the Cloud
Functions). Pick ONE file. Smaller is better; one component or one function per cycle.

Add a TODO entry in `docs/translation-progress.md` so we know what is in flight, what is specced, and what is
implemented.

### Step 2 - Run festify-translator

```
Agent(subagent_type: festify-translator,
      prompt: "Translate .reference/festify/src/components/queue-list.ts into a behavioral spec at
               docs/specs/queue-list.spec.md. Pay particular attention to how the queue ordering reacts to
               vote changes - this is the core feature we are preserving.")
```

The translator reads the file and writes the spec. It is forbidden by its system prompt from emitting any
code from the source. Review its output: if you see code blocks, transcribed types, or implementation-detail
identifiers (`_handleX`, `mungeY`), reject and ask it to redo.

### Step 3 - Spec review

Quick human review (or invoke `code-reviewer` agent on the spec) to catch:

- Code fragments slipped through.
- Festify identifiers that are not domain words.
- Sections with so much implementation detail that they read like translated pseudocode.

If anything fails the review, revise before moving to step 4. **Never** tell the implementer "also peek at
the source if confused" - that defeats the firewall.

### Step 4 - Implement from the spec

Frontend:

```
Agent(subagent_type: react-component-author,
      prompt: "Implement docs/specs/queue-list.spec.md as a React component at
               apps/web/src/components/QueueList.tsx. Pair with a Vitest test file.")
```

Backend (when the spec describes server-side behavior):

```
Agent(subagent_type: gin-handler-author,
      prompt: "Implement docs/specs/<thing>.spec.md as a Gin handler with sqlc query and an OpenAPI entry.")
```

If the spec implies a schema change, the gin-handler-author will spawn `goose-migration-author` itself.

### Step 5 - Review and commit

- `code-review-graph` updates the graph automatically on save (via the PostToolUse hook).
- Run `/code-review` for the project's review pipeline.
- Commit with a `feat(port):` prefix referencing the spec, e.g.
  `feat(port): translate queue-list to React (spec: docs/specs/queue-list.spec.md)`.

## Forbidden shortcuts

- ❌ Pasting Festify code into Claude's chat for "context."
- ❌ Asking the implementer to "look at how Festify does it" mid-task.
- ❌ Copying Festify SCSS classes verbatim. Restyle in Tailwind from the visual description.
- ❌ Importing `@festify/*` npm packages.
- ❌ Naming our files identically to Festify's (e.g. our `QueueList.tsx` is fine; `queue-list.ts` is too close).

## CI check (to be added)

A future GitHub Actions job will:

- `git ls-files .reference/` and fail if non-empty (catches accidental commit of the clone).
- Grep `docs/specs/**/*.md` for code fences and fail on hits.
- Grep our source for known Festify identifier patterns and fail on hits.

This ensures the firewall is enforced mechanically, not just by policy.

## When in doubt

If a translation feels like it would require seeing the source twice, the unit is too big. Split the source
file into smaller behavioral chunks and translate each separately.
