import { describe, it, expect } from "vitest";
import { toEmbedUrl } from "./embed";

describe("toEmbedUrl", () => {
  it("embeds YouTube watch links", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
  });
  it("embeds youtu.be short links", () => {
    expect(toEmbedUrl("https://youtu.be/abc123?t=4")).toBe("https://www.youtube-nocookie.com/embed/abc123");
  });
  it("keeps the private hash on unlisted Vimeo links", () => {
    expect(toEmbedUrl("https://vimeo.com/123456/abcdef12")).toBe("https://player.vimeo.com/video/123456?h=abcdef12");
  });
  it("rejects non-video links", () => {
    expect(toEmbedUrl("https://example.com/file.pdf")).toBeNull();
  });
});
