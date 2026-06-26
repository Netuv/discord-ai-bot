import type { Article, ContentBrief } from '../types/content';

export function parseArticleResponse(raw: string, brief: ContentBrief): Article | null {
  // Try to extract JSON from the response
  try {
    // Find JSON block (between ```json and ``` or first { to last })
    const jsonMatch = raw.match(/```json\n?([\s\S]*?)\n?```/);
    const jsonStr = jsonMatch?.[1] ?? raw;

    const parsed = JSON.parse(jsonStr.trim().startsWith('{') ? jsonStr.trim() : `{${jsonStr}}`);

    // Validate structure
    if (!parsed.title || !parsed.intro || !Array.isArray(parsed.sections)) {
      return null;
    }

    // Clean sections
    const sections = parsed.sections
      .filter((s: { heading?: string; body?: string }) => s.heading && s.body)
      .map((s: { heading: string; body: string; imageDescription?: string; videoQuery?: string }) => ({
        heading: s.heading.trim(),
        body: s.body.trim(),
        imageDescription: s.imageDescription?.trim() ?? null,
        // videoQuery is stored temporarily; will be replaced with real URL by orchestrator
        videoUrl: null, // filled later by video search
        videoTitle: s.videoQuery?.trim() ?? null, // store query here temporarily
      }));

    return {
      title: parsed.title.trim(),
      intro: parsed.intro.trim(),
      sections,
      category: brief.category,
      format: brief.format,
      depth: brief.depth,
    };
  } catch {
    return null;
  }
}
