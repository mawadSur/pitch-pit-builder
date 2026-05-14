#!/usr/bin/env node
// Drives the Claude Agent SDK to generate a Next.js MVP from a pitch.
//
// Input: the repository_dispatch payload, surfaced through env vars by
// build-mvp.yml. We read it back from the GitHub event JSON for fields
// that need shaping (strengths, concerns) rather than passing them on
// the command line.
//
// Output: a complete Next.js 15 project under `out/mvp-<slug>/`.
// The workflow then `git init` + `gh repo create` + `vercel deploy`.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const event = JSON.parse(
  readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
);
const payload = event.client_payload;
const idea = payload.idea;
const slug = payload.slug;
const subdomain = payload.subdomain;
const ideaUrl = `https://pitchpit.app/idea/${idea.id}`;

const outDir = resolve(process.cwd(), "out", `mvp-${slug}`);
mkdirSync(outDir, { recursive: true });

const prompt = `You are building an MVP for a pitch-pit winner. The MVP is a one-screen
Next.js 15 app that demonstrates the product idea. It will be deployed to
https://${subdomain}.pitchpit.app.

# Idea
Title: ${idea.title}
Pitch:
${idea.pitch}

AI verdict: ${idea.verdict}
Strengths:
${(idea.strengths ?? []).map((s) => `- ${s}`).join("\n")}
Concerns:
${(idea.concerns ?? []).map((s) => `- ${s}`).join("\n")}

# Stack constraints
- Next.js 15 (App Router) + TypeScript strict
- Tailwind CSS
- No database unless absolutely required; if needed, Supabase
- All files written under: ${outDir}

# Required deliverables
1. A working \`package.json\` with \`build\`/\`start\`/\`dev\` scripts
2. A one-screen landing at app/page.tsx that:
   - Explains the product in one tagline + one paragraph
   - Has a single primary CTA that demonstrates the core action
   - Looks polished (Tailwind, real spacing, real type hierarchy)
3. A README explaining what it does and how to run it
4. A vercel.json or default config so \`vercel deploy\` works out of the box

# Footer attribution (required)
Include a small footer link on the landing page:
"shipped by pitch-pit · ${ideaUrl}"

# Important
- Do NOT include placeholder Lorem ipsum
- Write real, specific copy grounded in the pitch above
- Keep the scope tight — one screen, one CTA, ship.
`;

console.log("[build] Starting Claude Agent SDK…");

// The SDK writes files itself via the Write tool. We pass it permission
// only for the output directory so it can't escape into the workflow
// runner's working tree.
const result = await query({
  prompt,
  options: {
    workdir: outDir,
    allowedTools: ["Read", "Write", "Edit", "Bash"],
    permissionMode: "acceptEdits",
  },
});

let summary = "";
for await (const event of result) {
  if (event.type === "text") {
    summary += event.text;
    process.stdout.write(event.text);
  } else if (event.type === "tool_use") {
    console.log(`\n[build] tool: ${event.name}`);
  }
}

// Drop a sentinel so the next step knows where the MVP landed.
writeFileSync(
  resolve(outDir, ".pitch-pit-build.json"),
  JSON.stringify(
    { idea_id: idea.id, slug, subdomain, generated_at: new Date().toISOString() },
    null,
    2,
  ),
);

console.log(`\n[build] Generation complete → ${outDir}`);
