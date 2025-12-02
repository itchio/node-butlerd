# Changelog

## [15.0.0] - 2025-12-02

**Package renamed to `@itchio/butlerd`** - Update your imports from `"butlerd"` to `"@itchio/butlerd"`

- Fix exception when accessing process PID during endpoint timeout when process wasn't spawned
- Updated dependencies: split2, prettier, which, debug, typescript
- Removed unused dependencies: uuid, cross-env, rimraf
- Migrated CI from Travis to GitHub Actions
