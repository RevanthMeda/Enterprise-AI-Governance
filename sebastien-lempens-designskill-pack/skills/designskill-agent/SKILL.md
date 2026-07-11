---
name: designskill-agent-meta
description: >
  Meta-skill detailing how to invoke the DesignSkill Agent tool to extract
  design systems from any website.
---

# DesignSkill Agent Meta-Skill

This is a meta-skill explaining how to extract design skills and build agent design packs from any target URL.

## CLI Usage / Local Server API

The local DesignSkill Agent server runs at `http://localhost:3000`.

To extract design skills from a new website and generate its agent skill pack, issue the following HTTP requests:

### 1. Extract Design Skills
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```
Returns the normalized tokens, typography scale, component recipes, and animations.

### 2. [Optional] AI-Enrich
```bash
curl -X POST http://localhost:3000/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "tokens": <scraped_tokens_object>,
    "geminiApiKey": "YOUR_GEMINI_API_KEY"
  }'
```
Enriches the tokens with AI-authored descriptions.

### 3. Generate Skill Pack ZIP
```bash
curl -X POST http://localhost:3000/api/generate-plugin \
  -H "Content-Type: application/json" \
  -d '{
    "tokens": <enriched_tokens_object>,
    "siteName": "example",
    "siteUrl": "https://example.com"
  }' --output example-designskill-pack.zip
```
Generates the structured agent skill pack folder structure and packages it as a downloadable ZIP.

## Installation of Generated Skill Packs
Unzip the downloaded skill pack ZIP. Copy the folder to your agent skills folder:
- **Workspace-scope skills**: Drop into your project's `.agents/skills/` or run `gemini skills install ./example-designskill-pack` if utilizing a compatible toolchain.
- **Global skills**: Copy to your global agent configurations folder (e.g. `C:\Users\Welcome\.gemini\config\plugins\` or `~/.claude/skills/`).
