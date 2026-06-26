# Plugin System Guide

AI-Bot v7.0 supports three plugin types: **Format**, **Platform**, and **Source**.

All types defined in `src/plugins/types.ts`. Registry in `src/plugins/registry.ts`.

---

## Table of Contents

- [1. Format Plugin](#1-format-plugin)
- [2. Platform Plugin](#2-platform-plugin)
- [3. Source Plugin](#3-source-plugin)
- [4. Registration](#4-registration)
- [5. File Structure](#5-file-structure)
- [6. Best Practices](#6-best-practices)

---

## 1. Format Plugin

Controls how content is researched and prompted per format (e.g., `top-list`, `retrospective`).

```ts
import type { FormatPlugin } from '../plugins/types';
import type { Env } from '../types/env';
import type { BudgetTracker } from '../core/budget-tracker';
import type { ContentCategory, ContentBrief, FinalContent } from '../content/types/content';
import type { ResearchBundle } from '../content/research/types';

const myFormatPlugin: FormatPlugin = {
  id: 'my-format',
  name: 'My Custom Format',
  version: '1.0.0',

  // Research handler — fetch data for this topic
  async research(
    topic: string,
    category: ContentCategory,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    return { sources: [], summary: '' };
  },

  // Build LLM prompt from brief + research
  buildPrompt(brief: ContentBrief, research: ResearchBundle): string {
    return `Write a post about ${brief.topic} using: ${research.summary}`;
  },

  // Weight & cooldown for topic rotation
  weightConfig: {
    baseWeight: 1.0,
    cooldownDays: 2,
  },
};

export default myFormatPlugin;
```

**Interface:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier (kebab-case) |
| `name` | `string` | Human-readable name |
| `version` | `string` | Semver |
| `research()` | `fn` | Fetches research data for the topic |
| `buildPrompt()` | `fn` | Builds the LLM prompt from brief + research |
| `weightConfig` | `object` | `baseWeight` (priority), `cooldownDays` (days before reuse) |

---

## 2. Platform Plugin

Controls how final content is formatted for a specific platform (e.g., Twitter, LinkedIn).

```ts
import type { PlatformPlugin } from '../plugins/types';
import type { FinalContent } from '../content/types/content';

const myPlatformPlugin: PlatformPlugin = {
  id: 'my-platform',
  name: 'My Platform',
  version: '1.0.0',

  // Format FinalContent into a platform-specific payload
  format(content: FinalContent, imageUrl?: string): Record<string, unknown> {
    return {
      text: content.body,
      image_url: imageUrl ?? null,
    };
  },

  // Composio action ID for publishing
  actionId: 'MY_PLATFORM_POST',

  // Max characters allowed by this platform
  maxLength: 2000,
};

export default myPlatformPlugin;
```

**Interface:**

| Property | Type | Description |
|----------|------|-------------|
| `format()` | `fn` | Converts `FinalContent` → platform-specific payload |
| `actionId` | `string` | Composio action ID (used by `src/composio/`) |
| `maxLength` | `number` | Character limit for this platform |

---

## 3. Source Plugin

Adds a new research data source (e.g., a custom API).

```ts
import type { SourcePlugin } from '../plugins/types';
import type { BudgetTracker } from '../core/budget-tracker';
import type { ContentCategory } from '../content/types/content';
import type { ResearchBundle } from '../content/research/types';

const mySourcePlugin: SourcePlugin = {
  id: 'my-source',
  name: 'My Data Source',
  version: '1.0.0',

  async search(query: string, budget: BudgetTracker): Promise<ResearchBundle> {
    // Fetch from your API, use budget.track() for cost tracking
    return { sources: [], summary: '' };
  },

  // Which content categories this source supports
  supportedCategories: ['anime', 'gaming'],
};

export default mySourcePlugin;
```

**Interface:**

| Property | Type | Description |
|----------|------|-------------|
| `search()` | `fn` | Searches the source for a query, returns `ResearchBundle` |
| `supportedCategories` | `ContentCategory[]` | Categories this source handles |

---

## 4. Registration

Currently the registry only supports **Format Plugins**. Register at app startup:

```ts
import { registerFormatPlugin } from './plugins/registry';

registerFormatPlugin(myFormatPlugin);
```

The registry logs warnings if a plugin `id` is overwritten.

---

## 5. File Structure

```
src/
  plugins/
    types.ts          ← All plugin interfaces
    registry.ts       ← Registration & lookup
```

---

## 6. Best Practices

- **`id`** must be unique, use kebab-case (e.g., `'retrospective-format'`)
- Use `BudgetTracker` to track API costs inside `research()` / `search()`
- `research()` and `search()` must return a valid `ResearchBundle`
- `format()` must return `Record<string, unknown>` for Composio compatibility
- Version with semver; `registerFormatPlugin()` warns on `id` collision
- `PlatformPlugin.maxLength` is enforced before publish
- Place your plugin file in `src/plugins/` or a dedicated `plugins/` folder
