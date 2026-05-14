# pitch-pit builder template

This directory is a **template** for the separate GitHub repo that runs the
auto-build workflow. It does **not** run inside `pitch-pit` itself —
GitHub Actions on `pitch-pit` would time out (max 6h is fine, but cron
on Vercel can't reach a long-running worker). The builder lives in its
own repo so the runner can git-push freely and emit logs the operator
can inspect after the fact.

## How the pieces fit together

```
┌─────────────────────────┐    repository_dispatch    ┌──────────────────────────┐
│ pitch-pit /api/cron/    │ ────────────────────────▶ │ pitch-pit-builder        │
│ close-week-and-build    │   event: pitch-pit-build  │ .github/workflows/       │
│                         │                           │   build-mvp.yml          │
└─────────────────────────┘                           │  ├─ checkout             │
        ▲                                             │  ├─ Claude Agent SDK     │
        │ POST /api/build-callback                    │  ├─ gh repo create       │
        │ (per-phase + complete/failed)               │  ├─ vercel deploy        │
        │                                             │  └─ curl callback URL    │
        └─────────────────────────────────────────────┘
```

## One-time setup

1. **Create the builder repo.**

   ```bash
   gh repo create mawad10101/pitch-pit-builder --public
   cd pitch-pit-builder
   git init && git add . && git commit -m "init"
   ```

2. **Drop these files in:**

   - `.github/workflows/build-mvp.yml` — the workflow (see this directory)
   - `agent/build.mjs` — the Claude Agent SDK driver (see this directory)
   - `package.json` with `@anthropic-ai/claude-agent-sdk` as a dep

3. **Set repo secrets** (Settings → Secrets and variables → Actions):

   | Secret | Purpose |
   |---|---|
   | `ANTHROPIC_API_KEY` | Claude Agent SDK auth |
   | `GH_PAT_REPO` | PAT with `repo` scope — creates the per-MVP repo |
   | `VERCEL_TOKEN` | Vercel personal token — `vercel deploy` |
   | `VERCEL_ORG_ID` | Vercel team/scope ID |
   | `VERCEL_DNS_ZONE` | `pitchpit.app` — for the subdomain alias |
   | `CALLBACK_SHARED_SECRET` | Optional secondary auth (not required; callback_token is per-build) |

4. **On the pitch-pit side**, set these env vars (Vercel project settings):

   - `GITHUB_DISPATCH_TOKEN` — a PAT scoped to the builder repo's
     `repository_dispatch` permission
   - `GITHUB_BUILDER_OWNER=mawad10101`
   - `GITHUB_BUILDER_REPO=pitch-pit-builder`

## Dispatch payload contract

When pitch-pit fires `repository_dispatch`, the workflow receives this in
`github.event.client_payload`:

```json
{
  "idea": {
    "id": "uuid",
    "title": "string",
    "pitch": "string",
    "score": 9,
    "final_score": 92,
    "verdict": "string",
    "strengths": ["…"],
    "concerns": ["…"],
    "reasoning": "string"
  },
  "slug": "kebab-case",
  "subdomain": "mvp-<slug>",
  "callback_url": "https://pitchpit.app/api/build-callback",
  "callback_token": "32-hex",
  "attempt": 1
}
```

The workflow must POST progress + terminal status to `callback_url`:

```json
{
  "callback_token": "32-hex",
  "idea_id": "uuid",
  "phase": "generating" | "deploying" | "complete" | "failed",
  "log": "optional human-readable line",

  // on phase=complete:
  "mvp_url": "https://mvp-slug.pitchpit.app",
  "repo_url": "https://github.com/mawad10101/mvp-slug",
  "screenshot_url": "optional https url",

  // on phase=failed:
  "error": "short error string"
}
```

The pitch-pit callback receiver retries failed builds **once** before
falling back to a manual email; the workflow itself does not need
retry logic.
