# OhMyStack Changelog

> OhMyStack is based on [GStack](https://github.com/garrytan/gstack) by Garry Tan.
> This fork adapts GStack for the OhMy OpenAgent ecosystem with OMO-native
> multi-agent dispatch, OpenCode-only host support, and named agent workflows.

## [1.0.0] — 2026-04-14

### Added
- Initial fork from GStack v0.16.4.0
- Full rebrand: gstack → ohmystack
- OpenCode-only host support (7 unused hosts stripped)
- OMO multi-agent dispatch in 25 skills (+ 4 native rebrand = 29 total)
- Named agent patterns: Explore, Metis, Momus, Oracle, Librarian

### Changed
- Upgrade path points to sigvardt/OhMyStack
- State directory: ~/.ohmystack/
- Binary prefix: ohmystack-*
- Environment variables: OHMYSTACK_*

### Removed
- Claude, Codex, Factory, Kiro, Slate, Cursor, OpenClaw host support
- Team mode (deprecated)
- Telemetry infrastructure (disabled)
