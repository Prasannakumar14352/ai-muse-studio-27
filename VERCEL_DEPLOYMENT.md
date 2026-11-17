# Vercel Deployment Checklist — CreatorFlow AI

This project is a TanStack Start app backed by Lovable Cloud (Supabase). It
runs on Lovable hosting out of the box; deploying to Vercel requires the
extra configuration below.

---

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

Add to **Production**, **Preview**, and **Development**:

### Client-side (safe to expose, `VITE_*` are inlined at build time)

| Name | Value |
| ---- | ----- |
| `VITE_SUPABASE_URL` | `https://xjqbhktzhhivbpgnqwgm.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_rTmxuh-mF0wnGzqOV2VEQA_3zYCZMc_` |
| `VITE_SUPABASE_PROJECT_ID` | `xjqbhktzhhivbpgnqwgm` |

### Server-side (server functions / API routes only — never prefix with `VITE_`)

| Name | Notes |
| ---- | ----- |
| `SUPABASE_URL` | same as above |
| `SUPABASE_PUBLISHABLE_KEY` | same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project → API → `service_role`. **Server-only.** |
| `RAZORPAY_KEY_ID` | Razorpay dashboard → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay dashboard → Webhooks |
| `LOVABLE_API_KEY` | Only if you use Lovable AI Gateway from server code |

After adding/changing any variable, **redeploy** — Vercel does not hot-reload env.

---

## 2. Google OAuth (BYO credentials — required on Vercel)

Lovable's managed Google OAuth (`/~oauth/initiate`) only works on
`*.lovable.app` domains. On Vercel you must provide your own Google client.

### 2a. Google Cloud Console → APIs & Services → Credentials

Create an **OAuth 2.0 Client ID** (type: Web application).

**Authorized JavaScript origins**

```
https://<your-vercel-domain>
https://<your-preview-domain>.vercel.app   ← for previews (optional)
http://localhost:8080                       ← for local dev
```

**Authorized redirect URIs** — these must be the Supabase callback, **not**
your app URL:

```
https://xjqbhktzhhivbpgnqwgm.supabase.co/auth/v1/callback
```

Copy the **Client ID** and **Client Secret**.

### 2b. Supabase (via Lovable Cloud → Users → Auth Settings → Google)

1. Toggle **Use your own credentials** ON.
2. Paste **Client ID** and **Client Secret**.
3. Save.

### 2c. Supabase → Authentication → URL Configuration

- **Site URL**: `https://<your-vercel-domain>`
- **Additional Redirect URLs** (one per line):
  ```
  https://<your-vercel-domain>
  https://<your-vercel-domain>/dashboard
  https://<your-vercel-domain>/auth/callback
  https://*.vercel.app                       ← for preview deploys
  http://localhost:8080
  http://localhost:8080/dashboard
  ```

Without these, Supabase rejects the OAuth callback with
`redirect_uri not allowed`.

---

## 3. Asset loading

Logos and static images are now bundled into `public/brand/` and served
directly by Vercel (`/brand/logo.png`). No CDN configuration required.

If a logo ever fails to load, `<BrandLogo />` automatically swaps to the
local SVG fallback at `/brand/logo-fallback.svg`.

---

## 4. Verify after deploy

Open the deployed site and check DevTools:

- **Network** → `logo.png` returns **200**.
- **Console** → click "Continue with Google": expect a log like
  `[auth] google oauth start { provider: "google", redirectTo: "..." }`
  followed by either a redirect or an error object.
- **Application → Local Storage** → after sign-in, a `sb-...-auth-token`
  entry appears.

If Google sign-in returns "provider is not enabled", step 2b was skipped.
If it returns "redirect_uri not allowed", step 2c was skipped.
