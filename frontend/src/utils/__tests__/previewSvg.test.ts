import { describe, expect, it } from "vitest";
import { normalizePreviewSvg, previewHasEmbeddedImages, previewHasFlattenedMasks } from "../previewSvg";

describe("normalizePreviewSvg", () => {
  it("adds viewBox from background rect when missing", () => {
    const raw = [
      '<svg width="1456.7890625" height="1213.81640625">',
      '<rect x="0" y="0" width="728.39453125" height="606.908203125" fill="#fff"></rect>',
      '<path d="M0 0 L20 20"></path>',
      "</svg>",
    ].join("");

    const normalized = normalizePreviewSvg(raw);

    expect(normalized).toContain('viewBox="0 0 728.39453125 606.908203125"');
    expect(normalized).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("leaves existing viewBox unchanged", () => {
    const raw = '<svg viewBox="0 0 100 50" width="200" height="100"></svg>';
    const normalized = normalizePreviewSvg(raw);

    expect(normalized).toContain('viewBox="0 0 100 50"');
  });

  it("detects embedded image tags", () => {
    const raw = '<svg><image href="data:image/png;base64,AAAA"></image></svg>';
    expect(previewHasEmbeddedImages(raw)).toBe(true);
    expect(previewHasEmbeddedImages("<svg><rect/></svg>")).toBe(false);
  });

  it("repairs flattened image previews that are hidden by white canvas rect", () => {
    const raw = [
      '<svg viewBox="0 0 500 700" width="1000" height="1400">',
      '<image width="100%" height="100%" href="data:image/png;base64,AAAA"></image>',
      '<defs></defs>',
      '<rect x="0" y="0" width="500" height="700" fill="#ffffff"></rect>',
      "</svg>",
    ].join("");

    const normalized = normalizePreviewSvg(raw);

    expect(normalized).toContain('fill="transparent"');
  });

  it("detects mask rectangles flattened over an Excalidraw preview", () => {
    const broken = '<svg viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" fill="#f8f5ee"/><path d="M0 0H100V60" fill="#e7f5ff"/><rect x="0" y="0" width="150" height="90" fill="#fff"/><rect x="0" y="0" width="180" height="85" fill="#fff"/></svg>';
    expect(previewHasFlattenedMasks(broken)).toBe(true);
    expect(previewHasFlattenedMasks('<svg viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" fill="#fff"/></svg>')).toBe(false);
  });

  it("detects a single flattened mask and a flattened clipPath in defs", () => {
    const oneMask = '<svg viewBox="0 0 200 100"><rect width="200" height="100" fill="#f8f5ee"/><path d="M0 0H100"/><rect width="20" height="15" fill="#fff"/></svg>';
    const clipped = '<svg viewBox="0 0 200 100"><defs><rect width="20" height="15"/></defs><rect width="200" height="100" fill="#f8f5ee"/><path d="M0 0H100"/></svg>';
    expect(previewHasFlattenedMasks(oneMask)).toBe(true);
    expect(previewHasFlattenedMasks(clipped)).toBe(true);
  });
});
