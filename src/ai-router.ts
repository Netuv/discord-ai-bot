/**
 * AI Router — Sistem Switching Provider AI dengan Auto-Failover
 *
 * Cara kerja:
 * 1. Coba provider dengan priority tertinggi (angka terkecil)
 * 2. Jika gagal → fallback otomatis ke provider berikutnya
 * 3. Jika semua gagal → throw error
 *
 * Supported provider types:
 * - `cloudflare` — Cloudflare Workers AI (env.AI binding)
 * - `openai` — OpenAI-compatible API (NVIDIA NIM, OpenRouter, OpenCode, dll)
 *
 * Vision support:
 * - `callCloudflareVision()` — Kirim gambar + teks ke model vision (Xiaomi MiMo V2.5, Llama 3.2 90B Vision, dll)
 * - `callOpenAIVision()` — Kirim gambar + teks ke OpenAI-compatible vision API
 *
 * Setup:
 * - Cloudflare AI: otomatis (dari binding wrangler.jsonc)
 * - OpenAI-compatible: Set secret `NAMA_PROVIDER_API_KEY=nilai_key`
 *   Lalu daftarkan provider di `defaultProviders` atau via environment.
 */

// ─── Types ─────────────────────────────────────────────────

export interface AiProvider {
  name: string;
  priority: number;       // Lower = dicoba lebih dulu
  model: string;
  type: "cloudflare" | "openai";
  apiKeyEnv?: string;     // Nama secret environment untuk API key
  baseUrl?: string;       // Base URL untuk OpenAI-compatible API
  extraHeaders?: Record<string, string>; // Header tambahan (contoh: HTTP-Referer untuk OpenRouter)
}

export interface AiRouterConfig {
  providers: AiProvider[];
  timeoutMs: number;
  maxRetriesPerProvider: number;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ─── Vision Types ─────────────────────────────────────────

/**
 * Content part untuk Vision/multimodal request
 */
export type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType?: string }; // image: base64 or URL

export interface VisionMessage {
  role: "system" | "user" | "assistant";
  content: string | VisionContentPart[];
}

// ─── Default Providers (untuk Chat / AI Writer) — 4 Layer ──
// Priority: OpenCode -> Step 3.7 Flash (NVIDIA) -> Cloudflare -> OpenRouter
//
// 🆓 OpenCode: deepseek-v4-flash-free — gratis, recommended buat nulis artikel
// 🟢 Step 3.7 Flash: 198B MoE via NVIDIA NIM (free tier) — layer 2 fallback
// 🌤️ Cloudflare: built-in AI binding, fallback andalan
// 🟣 OpenRouter: butuh API key (gratis daftar di openrouter.ai)

const defaultProviders: AiProvider[] = [
  // Priority 1: OpenCode — deepseek-v4-flash-free (GRATIS! 🆓)
  {
    name: "OpenCode",
    priority: 1,
    model: "deepseek-v4-flash-free",
    type: "openai",
    apiKeyEnv: "OPENCODE_API_KEY",
    baseUrl: "https://opencode.ai/zen/v1",
  },
  // Priority 2: Step 3.7 Flash — 198B MoE via NVIDIA NIM (free tier)
  {
    name: "Step 3.7 Flash",
    priority: 2,
    model: "stepfun-ai/step-3.7-flash",
    type: "openai",
    apiKeyEnv: "NVIDIA_API_KEY",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  },
  // Priority 3: Cloudflare Workers AI (built-in, selalu available)
  {
    name: "Cloudflare Workers AI",
    priority: 3,
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    type: "cloudflare",
  },
  // Priority 4: OpenRouter (gratis — butuh API key)
  {
    name: "OpenRouter",
    priority: 4,
    model: "meta-llama/llama-3.3-70b-instruct:free",
    type: "openai",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/Netuv/discord-ai-bot",
      "X-Title": "Discord AI Bot",
    },
  },
];

// ─── Default Vision Providers (modular, untuk OCR/vision tasks) ───
// Terpisah dari chat providers — biar gak campur aduk!
// Priority: Xiaomi MiMo V2.5 (via OpenRouter) -> Cloudflare Llama 3.2 90B Vision -> OpenRouter Gemma 3 12B
//
// 📸 Xiaomi MiMo V2.5 — native omnimodal (image, video, audio) via OpenRouter
// 👁️ Cloudflare Llama 3.2 90B Vision — dedicated vision model

const defaultVisionProviders: AiProvider[] = [
  // Priority 1: Xiaomi MiMo V2.5 (native omnimodal — vision, video, audio)
  {
    name: "Xiaomi MiMo V2.5",
    priority: 1,
    model: "xiaomi/mimo-v2.5",
    type: "openai",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/Netuv/discord-ai-bot",
      "X-Title": "Discord AI Bot — Vision",
    },
  },
  // Priority 2: Cloudflare Llama 3.2 90B Vision (dedicated vision model)
  {
    name: "Cloudflare Vision",
    priority: 2,
    model: "@cf/meta/llama-3.2-90b-vision-instruct",
    type: "cloudflare",
  },
  // Priority 3: OpenRouter free vision fallback (Gemma 3 12B)
  {
    name: "OpenRouter Vision",
    priority: 4,
    model: "google/gemma-3-12b-it:free",
    type: "openai",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/Netuv/discord-ai-bot",
      "X-Title": "Discord AI Bot — Vision",
    },
  },
];

// ─── Provider Models Info (untuk ditampilkan di Discord/MCP) ──

export interface ProviderModelInfo {
  name: string;
  emoji: string;
  secret?: string;
  note: string;
  models: { name: string; note: string }[];
}

export const defaultProviderModels: ProviderModelInfo[] = [
  // ── CHAT / WRITER PROVIDERS (Priority order) ──
  {
    name: "OpenCode",
    emoji: "🔵",
    secret: "OPENCODE_API_KEY",
    note: "🇩🇪 #1 Priority Writer — deepseek-v4-flash-free (GRATIS 🆓)",
    models: [
      { name: "deepseek-v4-flash-free", note: "✅ Default Writer (FREE) 🆓" },
      { name: "deepseek-v4-flash", note: "" },
      { name: "deepseek-v4-pro", note: "" },
      { name: "big-pickle", note: "FREE 🆓" },
    ],
  },
  {
    name: "Step 3.7 Flash",
    emoji: "🟢",
    secret: "NVIDIA_API_KEY",
    note: "#2 Priority — 198B MoE via NVIDIA NIM (free tier)",
    models: [
      { name: "stepfun-ai/step-3.7-flash", note: "✅ Default Layer 2 🆓" },
    ],
  },
  {
    name: "Cloudflare Workers AI",
    emoji: "🌤️",
    note: "#3 Priority — Built-in, tanpa setup",
    models: [
      { name: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", note: "🚀 Fast & Reliable" },
      { name: "@cf/meta/llama-3.1-8b-instruct", note: "" },
      { name: "@cf/meta/llama-3.2-3b-instruct", note: "" },
      { name: "@cf/meta/llama-3.2-90b-vision-instruct", note: "👁️ Vision" },
      { name: "@cf/mistral/mistral-7b-instruct-v0.1", note: "" },
      { name: "@cf/microsoft/phi-3-mini-4k-instruct", note: "" },
      { name: "@cf/qwen/qwen2-72b-instruct", note: "" },
      { name: "@cf/deepseek-ai/deepseek-math-7b-instruct", note: "" },
    ],
  },
  {
    name: "OpenRouter",
    emoji: "🟣",
    secret: "OPENROUTER_API_KEY",
    note: "#4 Priority — Daftar di openrouter.ai",
    models: [
      { name: "meta-llama/llama-3.3-70b-instruct:free", note: "Default" },
      { name: "meta-llama/llama-3.2-3b-instruct:free", note: "" },
      { name: "meta-llama/llama-3.3-70b-instruct:free", note: "" },
      { name: "google/gemma-4-31b-it:free", note: "" },
      { name: "google/gemma-4-26b-a4b-it:free", note: "" },
      { name: "qwen/qwen3-coder:free", note: "" },
      { name: "nousresearch/hermes-3-llama-3.1-405b:free", note: "" },
      { name: "openrouter/free", note: "Otomatis pilih model gratis" },
      { name: "cohere/north-mini-code:free", note: "" },
      { name: "nvidia/nemotron-3-ultra-550b-a55b:free", note: "" },
      { name: "openai/gpt-oss-120b:free", note: "" },
    ],
  },
  // ── VISION / OCR PROVIDERS (modular tools, terpisah!) ──
  {
    name: "Xiaomi MiMo V2.5",
    emoji: "📸",
    secret: "OPENROUTER_API_KEY",
    note: "#1 Vision/OCR — Native omnimodal via OpenRouter",
    models: [
      { name: "xiaomi/mimo-v2.5", note: "✅ Default Vision (multimodal) 📸" },
      { name: "xiaomi/mimo-v2.5-pro", note: "🚀 Pro (lebih kuat)" },
    ],
  },
  {
    name: "Cloudflare Vision",
    emoji: "👁️",
    note: "#2 (after MiMo V2.5) — Built-in, gratis",
    models: [
      { name: "@cf/meta/llama-3.2-90b-vision-instruct", note: "✅ Default Vision 👁️" },
    ],
  },
];

// ─── Router Class ─────────────────────────────────────────

class AiRouter {
  private config: AiRouterConfig;
  private visionConfig: AiRouterConfig; // Vision provider — modular, terpisah!
  private env: any;

  constructor(env: any, config?: Partial<AiRouterConfig>) {
    this.env = env;

    // ── Chat / Writer Providers ──
    const availableProviders = defaultProviders.filter((p) => {
      if (p.type === "cloudflare") return true; // Built-in, selalu available
      if (!p.apiKeyEnv) return false;
      return !!env[p.apiKeyEnv];
    });

    this.config = {
      providers: availableProviders,
      timeoutMs: 30000,
      maxRetriesPerProvider: 1,
      ...config,
    };

    if (this.config.providers.length === 0) {
      console.warn("⚠️ Tidak ada AI provider yang tersedia!");
    }

    // ── Vision / OCR Providers (modular, terpisah dari chat!) ──
    const availableVisionProviders = defaultVisionProviders.filter((p) => {
      if (p.type === "cloudflare") return true;
      if (!p.apiKeyEnv) return false;
      return !!env[p.apiKeyEnv];
    });

    this.visionConfig = {
      providers: availableVisionProviders,
      timeoutMs: 40000, // Vision butuh timeout lebih lama
      maxRetriesPerProvider: 1,
    };
  }

  /**
   * Chat dengan AI — auto-failover antar provider
   * Bisa pilih provider/model tertentu via options
   */
  async chat(messages: AiMessage[], options?: { model?: string; providerName?: string }): Promise<string> {
    if (this.config.providers.length === 0) {
      throw new Error("Tidak ada AI provider yang tersedia. Set secret API key atau pastikan AI binding aktif.");
    }

    // Jika user pilih provider tertentu, coba itu langsung
    if (options?.providerName) {
      const selected = this.config.providers.find(
        (p) => p.name.toLowerCase() === options.providerName!.toLowerCase()
      );
      if (selected) {
        try {
          return await this.callProvider(selected, messages, options);
        } catch (e: any) {
          throw new Error(`${selected.name} error: ${e.message}`);
        }
      }
    }

    // Auto-failover berdasarkan priority
    const sortedProviders = [...this.config.providers].sort((a, b) => a.priority - b.priority);
    let lastError = "";

    for (const provider of sortedProviders) {
      for (let attempt = 0; attempt <= this.config.maxRetriesPerProvider; attempt++) {
        try {
          const result = await this.callProvider(provider, messages, options);
          return result;
        } catch (e: any) {
          lastError = `${provider.name}: ${e.message}`;
          if (attempt < this.config.maxRetriesPerProvider) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
    }

    throw new Error(`❌ Semua AI provider gagal. Terakhir: ${lastError}`);
  }

  /**
   * Chat dengan user config dari KV (provider + model custom)
   */
  async chatWithUserConfig(messages: AiMessage[], userConfig: { providerName?: string | null; modelName?: string | null }): Promise<string> {
    return this.chat(messages, {
      providerName: userConfig.providerName || undefined,
      model: userConfig.modelName || undefined,
    });
  }

  /**
   * Cari provider berdasarkan nama
   */
  findProvider(name: string): { name: string; model: string; type: string; priority: number } | undefined {
    const found = this.config.providers.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!found) return undefined;
    return { name: found.name, model: found.model, type: found.type, priority: found.priority };
  }

  /**
   * Dapatkan semua model yang valid dari provider tertentu
   */
  getModelsForProvider(providerName: string): { name: string; note: string }[] | undefined {
    const info = defaultProviderModels.find((p) => p.name.toLowerCase() === providerName.toLowerCase());
    return info?.models;
  }

  /**
   * Dapatkan daftar provider yang aktif
   */
  getActiveProviders(): { name: string; model: string; type: string }[] {
    return this.config.providers.map((p) => ({
      name: p.name,
      model: p.model,
      type: p.type,
    }));
  }

  // ─── Private: Eksekusi per-provider ─────────────────────

  private async callProvider(
    provider: AiProvider,
    messages: AiMessage[],
    options?: { model?: string }
  ): Promise<string> {
    switch (provider.type) {
      case "cloudflare":
        return this.callCloudflare(provider, messages, options);
      case "openai":
        return this.callOpenAI(provider, messages, options);
      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }

  private async callCloudflare(provider: AiProvider, messages: AiMessage[], options?: { model?: string }): Promise<string> {
    if (!this.env.AI) throw new Error("Cloudflare AI binding tidak tersedia");

    const model = options?.model || provider.model;
    const result = await this.env.AI.run(model, { messages });

    if (!result || !result.response) {
      throw new Error("AI tidak memberikan respons");
    }

    return result.response;
  }

  private async callOpenAI(provider: AiProvider, messages: AiMessage[], options?: { model?: string }): Promise<string> {
    const apiKey = provider.apiKeyEnv ? this.env[provider.apiKeyEnv] : null;
    if (!apiKey) throw new Error(`API key untuk ${provider.name} tidak tersedia (butuh secret: ${provider.apiKeyEnv})`);

    const model = options?.model || provider.model;
    const baseUrl = provider.baseUrl || "https://api.openai.com/v1";

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "discord-ai-bot/1.0",
      ...(provider.extraHeaders || {}),
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`${provider.name} error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`${provider.name}: respons kosong`);
    }

    return content;
  }

  // ─── Vision / Multimodal ────────────────────────────────

  /**
   * Chat dengan VISION / OCR — kirim gambar + teks, dapatkan analisis AI.
   * MODULAR: pake `defaultVisionProviders` terpisah dari chat providers.
   *
   * Priority:
   *   1️⃣ Xiaomi MiMo V2.5 (native omnimodal via OpenRouter)
   *   2️⃣ Cloudflare Llama 3.2 90B Vision (dedicated vision)
   *   3️⃣ OpenRouter free vision fallback (Gemma 3 12B)
   *
   * Contoh:
   * ```ts
   * const result = await router.visionChat([
   *   { role: "user", content: [
   *     { type: "text", text: "Anime apa ini?" },
   *     { type: "image", image: imageUrl }
   *   ]}
   * ]);
   * ```
   */
  async visionChat(messages: VisionMessage[], options?: { model?: string; providerName?: string }): Promise<string> {
    const visionProviders = this.visionConfig.providers;

    if (visionProviders.length === 0) {
      throw new Error("Tidak ada vision provider yang tersedia. Set OPENROUTER_API_KEY atau pastikan AI binding aktif.");
    }

    if (options?.providerName) {
      const selected = visionProviders.find(
        (p) => p.name.toLowerCase() === options.providerName!.toLowerCase()
      );
      if (selected) {
        try {
          return await this.callVisionProvider(selected, messages, options);
        } catch (e: any) {
          throw new Error(`${selected.name} vision error: ${e.message}`);
        }
      }
    }

    // Auto-failover: priority 1 → 2 → 3 → 4
    const sorted = [...visionProviders].sort((a, b) => a.priority - b.priority);
    let lastError = "";

    for (const provider of sorted) {
      try {
        return await this.callVisionProvider(provider, messages, options);
      } catch (e: any) {
        lastError = `${provider.name}: ${e.message}`;
        console.warn(`⚠️ Vision provider ${provider.name} gagal: ${e.message}`);
      }
    }

    throw new Error(`❌ Semua vision provider gagal. Terakhir: ${lastError}`);
  }

  /**
   * Konversi VisionMessage[] ke format yang sesuai dengan provider
   */
  private buildVisionPayload(messages: VisionMessage[], model: string): any {
    // Deteksi: kalau content adalah string biasa, kirim sebagai text biasa
    const needsMultimodal = messages.some((m) => Array.isArray(m.content));

    if (!needsMultimodal) {
      // Fallback ke chat biasa
      return { model, messages: messages as any };
    }

    // Format multimodal untuk OpenAI-compatible API
    const formattedMessages = messages.map((m) => {
      if (!Array.isArray(m.content)) {
        return { role: m.role, content: m.content };
      }

      const content: any[] = m.content.map((part) => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        }
        if (part.type === "image") {
          // Kalau image URL, fetch dulu jadi base64
          // (Ini akan di-handle di callVisionProvider)
          return {
            type: "image_url",
            image_url: { url: part.image, detail: "high" },
          };
        }
        return { type: "text", text: "" };
      });

      return { role: m.role, content };
    });

    return {
      model,
      messages: formattedMessages,
      max_tokens: 4096,
    };
  }

  private async callVisionProvider(
    provider: AiProvider,
    messages: VisionMessage[],
    options?: { model?: string }
  ): Promise<string> {
    const model = options?.model || provider.model;

    switch (provider.type) {
      case "cloudflare": {
        if (!this.env.AI) throw new Error("Cloudflare AI binding tidak tersedia");

        // Cloudflare Workers AI Vision: format content array
        const cfMessages = await this.buildCloudflareVisionMessages(messages);
        const result = await this.env.AI.run(model, { messages: cfMessages });

        if (!result || !result.response) {
          throw new Error("Cloudflare Vision tidak memberikan respons");
        }
        return result.response;
      }
      case "openai": {
        const apiKey = provider.apiKeyEnv ? this.env[provider.apiKeyEnv] : null;
        if (!apiKey) throw new Error(`API key untuk ${provider.name} tidak tersedia`);

        const baseUrl = provider.baseUrl || "https://api.openai.com/v1";
        const payload = this.buildVisionPayload(messages, model);

        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "discord-ai-bot/1.0",
          ...(provider.extraHeaders || {}),
        };

        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.config.timeoutMs + 10000), // Vision perlu timeout lebih lama
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "unknown");
          throw new Error(`${provider.name} vision error (${res.status}): ${errText.slice(0, 300)}`);
        }

        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error(`${provider.name}: vision response kosong`);
        return content;
      }
      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }

  /**
   * Build Cloudflare-compatible vision messages
   * Workers AI format: content bisa array of {type: "text"|"image", image: "..."}
   */
  private async buildCloudflareVisionMessages(messages: VisionMessage[]): Promise<any[]> {
    const result: any[] = [];

    for (const msg of messages) {
      if (!Array.isArray(msg.content)) {
        // String biasa
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Array of content parts — perlu fetch gambar URL ke base64
      const content: any[] = [];

      for (const part of msg.content) {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text });
        } else if (part.type === "image") {
          // Cloudflare Workers AI butuh base64 atau URL langsung
          // Coba kirim sebagai URL dulu
          content.push({ type: "image", image: part.image });
        }
      }

      result.push({ role: msg.role, content });
    }

    return result;
  }
}

export { AiRouter };
