# dialstack-docs

An [Agent Skill](https://agentskills.io) that makes AI coding agents answer
DialStack questions from the live documentation at
[docs.dialstack.ai](https://docs.dialstack.ai) rather than from memory.

Without it, agents answer DialStack questions from training data. Our docs are
public, so that recall is fluent and often nearly right — which is what makes it
dangerous: the answer carries no source, and the parts that have gone stale look
exactly like the parts that have not.

The skill is a pointer layer, not a copy of the docs. It carries almost no
product detail of its own, so it stays correct as the product ships.

## Install

### Claude Code

```
/plugin marketplace add dialstack/dialstack-sdk
/plugin install dialstack-docs@dialstack
```

Updates arrive on their own: neither `.claude-plugin/plugin.json` nor the
marketplace entry declares a `version`, so for a github-sourced marketplace
every commit counts as a new version. **Do not add a `version` field.** Claude
Code resolves it from `plugin.json` first and skips the update while the string
is unchanged, which would strand every existing install on the skill as it was
the day they installed it — for a pointer skill that ships corrections
continuously, that is the whole value gone. Declaring it in both files also
silently masks the marketplace value.

### Any other Agent Skills client

Cursor, OpenAI Codex, Gemini CLI, GitHub Copilot, Amp, Goose, OpenCode, Factory
and others read the same format. Copy this directory into wherever your tool
looks for skills:

```
git clone https://github.com/dialstack/dialstack-sdk
cp -r dialstack-sdk/skills/dialstack-docs <your-tool's-skills-directory>
```

Consult your tool's documentation for that path. Only `SKILL.md` is required —
the `.claude-plugin/` directory is a Claude Code adapter that other tools ignore.

### Claude.ai / Cowork organization skill

An organization owner uploads it once under **Settings → Skills → Organization
skills**, after which everyone in the organization has it. Build the zip with
`./package.sh`.

## Editing this skill

Two rules keep it useful.

**Keep it vendor-neutral.** `SKILL.md` must not name any specific agent's tools
or commands — no tool names, no slash commands. Say "fetch the URL". The same
file ships to a dozen different clients and anything vendor-specific is noise or
an outright error in most of them.

**Do not copy documentation into it.** The moment it restates an endpoint, a
parameter, or a portal screen, it starts drifting from the docs and eventually
contradicts them. It should hold behavior and pointers only. If you find
yourself adding product facts, fix the docs instead and point at them.

The one deliberate exception is the rules block at the end of `SKILL.md`, which
must be inline — a skill's content is in the model's context when it triggers,
and rules behind a fetch cannot prevent an answer given before fetching. That
block is mirrored from a single source and verified byte-for-byte by CI.
