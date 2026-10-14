# Floating Todo

A small daily checklist app for [Kiro Crew](https://github.com/kirodotdev/KiroCrew), with a pop-out floating window.

- Per-day task list with check-off, a progress bar, and day navigation
- "From earlier": unfinished tasks from past days, one click (→) to move them to today
- 7-day history bars
- **Float** button opens the list in a small always-on-top window (Document Picture-in-Picture)
- Data lives in one JSON file under the app's data directory

This is v0.1: tasks are added by hand. Agent-proposed tasks and a schedule import are future work.

## Install

```bash
git clone https://github.com/nathanyi96/kirocrew-floating-todo
kirocrew app install ./kirocrew-floating-todo
kirocrew app enable floating-todo
```

`ui/dist/` is committed, so no build is needed to install. To rebuild after editing the UI:

```bash
cd ui && npm install && npm run build
```

## Layout

```
app.json            manifest (page /apps/floating-todo, standalone backend, storage)
backend/server.py   stdlib HTTP server, JSON-file store, verifies X-KiroCrew-Proxy
ui/src/App.tsx      React page + Picture-in-Picture pop-out
tests/              backend tests: python3 -m unittest discover -s tests
```

## Status and known gaps

- Backend tests and the UI typecheck/build pass. The UI was exercised against the real backend in a
  stand-in harness (add, check, carry-over move). It has **not** yet been run inside a live Kiro Crew
  gateway, so the proxy path prefix and the `X-KiroCrew-Proxy` check are unverified end to end.
- The backend strips the prefixes `/apps/floating-todo/api`, `/api/apps/floating-todo` and `/api`, so it
  tolerates either proxy convention.
- The pop-out uses Document Picture-in-Picture (Chromium 116+). Without it the **Float** button shows a note.
- Kiro Crew has no extension point for a third-party app to declare its own native floating window
  (`ui.overlays` is builtin-only; Mochi and Crew Companion ship theirs inside the desktop bundle).
  Picture-in-Picture is the workaround.

## Security

The backend binds `127.0.0.1` and rejects any request that is not signed by the gateway proxy
(fail closed; `/health` is the only open route). For running `backend/server.py` by hand, set
`FLOATING_TODO_DEV=1` to skip the signature check. Never set it in an installed app.

## License

MIT
