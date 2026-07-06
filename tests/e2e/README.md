# End-to-end regression test — Carousel flow

Python Playwright script that exercises the full "Create → Carousel (9:16) →
project page → carousel preview → regenerate & export" flow against a running
dev server. It's the smoke test that catches build/runtime regressions in
carousel generation before shipping.

## What it verifies

1. `/create` renders and can spawn a new carousel project with a 9:16 ratio
   and reduced slide count (fast — 3 API calls only).
2. After creation the user lands on `/projects/$id` and the "Copy post text"
   and "Ready to Post" buttons are present.
3. `/carousels` lists the new project card with the correct prompt count and
   ratio badge, and per-slide script details are viewable.
4. Clicking **Generate slides** actually persists images (bytes go through
   IndexedDB) and the `<img>` tags render.
5. **Export ZIP** downloads a non-empty archive.
6. Clicking **Delete carousel** opens the in-app confirm dialog (NOT
   `window.confirm`) and removes the card after confirm.

## Requirements

- Preview dev server running at `http://localhost:8080` (the sandbox default).
- `LOVABLE_BROWSER_SUPABASE_*` env vars injected (managed Supabase session).
- Python 3 with Playwright installed (pre-installed in the Lovable sandbox).

## Run

```bash
python3 tests/e2e/carousel-flow.py
```

Screenshots and a log dump are written to `/tmp/browser/carousel-flow/`.
Exit code 0 = pass, non-zero = fail with the offending step printed to
stderr.
