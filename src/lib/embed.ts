/** Turn a YouTube/Vimeo share link into an embeddable player URL, or null. */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/);
      if (m) return `https://www.youtube-nocookie.com/embed/${m[2]}`;
      return null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const parts = u.pathname.split("/").filter(Boolean).filter((p) => p !== "video");
      const id = parts[0];
      if (!id || !/^\d+$/.test(id)) return null;
      const hash = parts[1] && /^[0-9a-f]+$/i.test(parts[1]) ? parts[1] : u.searchParams.get("h");
      return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Google Drive / Docs links need /preview for inline viewing; other PDFs embed directly. */
export function toPdfViewerUrl(url: string): string {
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return url;
}

export const RESOURCE_TYPES = ["video", "pdf", "link", "slides", "template"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
