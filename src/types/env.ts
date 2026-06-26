export interface Env {
  // Storage
  BOT_KV: KVNamespace;
  CONTENT_DB: D1Database;

  // AI (built-in — no key needed)
  AI: Ai;

  // Queue
  TASK_QUEUE: Queue;

  // Discord
  DISCORD_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_DEFAULT_CHANNEL_ID: string;
  DISCORD_PUBLIC_KEY: string;

  // AI Providers (external)
  OPENCODE_API_KEY: string;
  NVIDIA_API_KEY: string;
  OPENROUTER_API_KEY: string;
  PUTER_API_KEY: string;

  // Search (optional)
  BRAVE_SEARCH_API_KEY?: string;
  GOOGLE_API_KEY?: string;      // Google API key (also works for YouTube)
  YOUTUBE_API_KEY?: string;     // Dedicated YouTube Data API v3 key
  GOOGLE_CX?: string;
  OLLAMA_WEB_SEARCH_KEY?: string; // ollama.com web_search API
  TAVILY_API_KEY?: string;        // api.tavily.com search (3rd layer fallback)

  // MCP Security
  MCP_SECRET: string;

  // Composio (optional — distribution layer)
  COMPOSIO_API_KEY?: string;
  COMPOSIO_TWITTER_ACCOUNT_ID?: string;
  COMPOSIO_INSTAGRAM_ACCOUNT_ID?: string;
  COMPOSIO_LINKEDIN_ACCOUNT_ID?: string;
  COMPOSIO_REDDIT_ACCOUNT_ID?: string;
  COMPOSIO_TELEGRAM_ACCOUNT_ID?: string;
}
