import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { getDrawingPreview } from "./drawings";

vi.mock("./client", () => ({ api: { get: vi.fn() }, isAxiosError: vi.fn() }));

describe("drawing preview requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the cancellation signal to the preview HTTP request", async () => {
    const signal = new AbortController().signal;
    vi.mocked(api.get).mockResolvedValue({ data: { preview: null } });
    await expect(getDrawingPreview("d1", signal)).resolves.toBeNull();
    expect(api.get).toHaveBeenCalledWith("/drawings/d1/preview", { signal });
  });

  it("normalizes stored SVG previews when no cancellation signal is supplied", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { preview: '<svg width="100" height="50"/>' } });
    const preview = await getDrawingPreview("d1");
    expect(preview).toContain('viewBox="0 0 100 50"');
    expect(api.get).toHaveBeenCalledWith("/drawings/d1/preview", { signal: undefined });
  });
});
