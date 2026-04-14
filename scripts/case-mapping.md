# OhMyStack Case Sensitivity Mapping

This document ensures consistent casing across all rebrand tasks (T8-T14).

## Mapping Table

| Context | Old Value | New Value |
|---------|-----------|-----------|
| Display name | G + Stack | OhMyStack |
| Repo name (GitHub) | g + stack | OhMyStack |
| Package name (npm) | g + stack | ohmystack |
| Directory paths (filesystem) | g + stack | ohmystack |
| Binary prefix | g + stack- | ohmystack- |
| Env var prefix | G + STACK_ | OHMYSTACK_ |
| Config dir (home) | .g + stack | .ohmystack |
| Attribution tag | (g + stack) | (ohmystack) |
| Skill prefix | g + stack- | ohmystack- |
| State dir | ~/.g + stack | ~/.ohmystack |
| Global root | .config/opencode/skills/g + stack | .config/opencode/skills/ohmystack |
| Local root | .opencode/skills/g + stack | .opencode/skills/ohmystack |
| Voice triggers | "gee stack", "g stack" | "oh my stack" |
| GitHub org/repo | garrytan/(g + stack) | sigvardt/OhMyStack |
| Remote URL | github.com/garrytan/(g + stack) | github.com/sigvardt/OhMyStack |

## Rules
1. Always use `OhMyStack` (mixed case) in display/documentation contexts
2. Always use `ohmystack` (lowercase) in code paths, package names, and config dirs
3. Always use `OHMYSTACK_` (uppercase) for environment variables
4. Always use `ohmystack-` (lowercase) for binary tool prefixes
5. The GitHub repo name is `OhMyStack` (mixed case) — this is how GitHub displays it
6. The git clone URL uses the display name: `sigvardt/OhMyStack.git`
