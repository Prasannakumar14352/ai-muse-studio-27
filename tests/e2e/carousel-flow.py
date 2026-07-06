"""End-to-end regression test for the carousel flow.

Covers: Create → Carousel (9:16) → project page → carousels preview →
generate slides → Export ZIP → in-app confirm delete.

Run with:  python3 tests/e2e/carousel-flow.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PWTimeout

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
OUT = Path(os.environ.get("E2E_ARTIFACTS_DIR", "/tmp/browser/carousel-flow"))
OUT.mkdir(parents=True, exist_ok=True)


def _fail(step: str, detail: str = ""):
    msg = f"[FAIL] {step}" + (f": {detail}" if detail else "")
    print(msg, file=sys.stderr)
    sys.exit(1)


async def restore_supabase_session(context, page):
    """Restore the sandbox-managed Supabase session so the auth guard passes."""
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not (storage_key and session_json):
        _fail("auth", "missing LOVABLE_BROWSER_SUPABASE_* env vars — cannot sign in")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE)
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
    )


async def create_carousel(page) -> str:
    """Create a carousel project with 9:16 layout, 3 slides. Returns project id."""
    await page.goto(f"{BASE}/create", wait_until="networkidle")
    await page.get_by_text("Instagram Carousel", exact=True).click()
    await page.fill("input[placeholder^='e.g.']", "E2E regression carousel")
    await page.get_by_role("button", name="Next: Style").click()
    await page.wait_for_timeout(300)
    # Aspect ratio 9:16
    await page.get_by_role("button", name="9:16", exact=True).click()
    # Force slide count to 3 (React-controlled range needs the native setter)
    await page.evaluate(
        "()=>{const r=document.querySelector('input[type=range]');"
        "const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
        "s.call(r,'3');r.dispatchEvent(new Event('input',{bubbles:true}))}"
    )
    await page.get_by_role("button", name="Next: Voice & Music").click()
    await page.wait_for_timeout(300)
    await page.get_by_role("button", name="Generate Project").click()
    await page.wait_for_url("**/projects/**", timeout=20000)
    pid = page.url.rstrip("/").rsplit("/", 1)[-1]
    # Navigate explicitly so the project page has time to mount and query
    await page.goto(f"{BASE}/projects/{pid}", wait_until="networkidle")
    return pid


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}, accept_downloads=True,
        )
        page = await context.new_page()
        logs: list[str] = []
        page.on("console", lambda m: logs.append(f"[{m.type}] {m.text[:400]}"))
        page.on("pageerror", lambda e: logs.append(f"[pageerror] {str(e)[:600]}"))
        page.on(
            "response",
            lambda r: logs.append(f"[net] {r.status} {r.url.split('?')[0][-80:]}")
            if "/api/generate-image" in r.url else None,
        )

        try:
            await restore_supabase_session(context, page)

            # ─── Step 1: create carousel ────────────────────────────────────
            pid = await create_carousel(page)
            print(f"[ok] created carousel project {pid}")
            await page.screenshot(path=str(OUT / "01_project_page.png"))

            # ─── Step 2: project page shows post-ready CTAs ─────────────────
            try:
                await page.get_by_test_id("copy-post-text").wait_for(state="visible", timeout=10000)
            except PWTimeout:
                _fail("project-page", "'Copy post text' button missing")
            if await page.get_by_test_id("ready-to-post").count() == 0:
                _fail("project-page", "'Ready to Post' button missing")
            # Carousel projects should show the "Open in Carousels" CTA
            if await page.get_by_role("link", name="Open in Carousels").count() == 0:
                _fail("project-page", "'Open in Carousels' link missing for carousel project")
            print("[ok] project page has ready-to-post CTAs")

            # ─── Step 3: carousels list shows the card ──────────────────────
            await page.goto(f"{BASE}/carousels", wait_until="networkidle")
            await page.wait_for_timeout(800)
            card = page.locator(
                f'div.glass:has(a[href$="/projects/{pid}"])'
            ).first
            try:
                await card.wait_for(state="visible", timeout=10000)
            except PWTimeout:
                _fail("carousels-list", "new carousel card did not appear")
            meta = await card.inner_text()
            if "9:16" not in meta:
                _fail("carousels-list", f"expected 9:16 badge, got: {meta[:200]}")
            if "3 prompts" not in meta:
                _fail("carousels-list", f"expected 3 prompts, got: {meta[:200]}")
            print("[ok] carousel card shows 9:16 + 3 prompts")

            # Per-slide script details should be present
            if await card.locator("details").count() == 0:
                _fail("carousels-list", "per-slide script <details> missing")

            # ─── Step 4: generate slides ────────────────────────────────────
            await card.get_by_role("button", name="Generate slides").click()
            imgs = 0
            # Poll up to 3 minutes for image tags to appear
            for _ in range(90):
                await page.wait_for_timeout(2000)
                imgs = await card.locator("img").count()
                if imgs > 0:
                    break
            if imgs == 0:
                Path(OUT / "logs.txt").write_text("\n".join(logs))
                await page.screenshot(path=str(OUT / "02_gen_failed.png"))
                _fail("generate-slides", "no <img> elements rendered after 180s")
            print(f"[ok] {imgs} slide image(s) rendered")
            await page.screenshot(path=str(OUT / "02_after_generate.png"))

            # ─── Step 5: export buttons visible & ZIP downloads ─────────────
            for name in ("Export ZIP", "Export PDF", "Export as Reel"):
                if await card.get_by_role("button", name=name).count() == 0:
                    _fail("export", f"'{name}' button missing")
            async with page.expect_download(timeout=20000) as dl_info:
                await card.get_by_role("button", name="Export ZIP").click()
            dl = await dl_info.value
            zip_path = OUT / dl.suggested_filename
            await dl.save_as(str(zip_path))
            if zip_path.stat().st_size < 1000:
                _fail("export-zip", f"zip suspiciously small: {zip_path.stat().st_size} bytes")
            print(f"[ok] Export ZIP downloaded ({zip_path.stat().st_size} bytes)")

            # ─── Step 6: delete via in-app confirm dialog ───────────────────
            await card.locator("button[title='Delete carousel']").click()
            confirm_btn = page.get_by_test_id("confirm-dialog-confirm")
            try:
                await confirm_btn.wait_for(state="visible", timeout=3000)
            except PWTimeout:
                _fail("delete-confirm", "in-app confirm dialog did not open")
            await confirm_btn.click()
            # Card should disappear after supabase delete + query invalidation
            gone = False
            for _ in range(40):
                await page.wait_for_timeout(500)
                if await page.locator(f'a[href$="/projects/{pid}"]').count() == 0:
                    gone = True
                    break
            if not gone:
                await page.screenshot(path=str(OUT / "03_delete_stuck.png"))
                # Surface the last few console messages so failures are actionable
                Path(OUT / "logs.txt").write_text("\n".join(logs))
                tail = "\n".join(logs[-20:])
                _fail("delete", f"card still present after confirm (20s). recent logs:\n{tail}")
            print("[ok] delete via in-app dialog removed the card")

            Path(OUT / "logs.txt").write_text("\n".join(logs))
            print("[pass] carousel flow e2e green")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
