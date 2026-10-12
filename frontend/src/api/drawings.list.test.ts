import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDrawings, getSharedDrawings } from "./drawings";
import { api } from "./client";

vi.mock("./client", () => ({ api: { get: vi.fn() }, isAxiosError: vi.fn() }));

describe("drawing list request cancellation", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.get).mockResolvedValue({ data: { drawings: [], totalCount: 0 } }); });
  it("passes the signal to Axios without putting it in query params", async () => {
    const signal = new AbortController().signal;
    await getDrawings("query", "collection", { limit: 24, signal });
    expect(api.get).toHaveBeenCalledWith("/drawings", { params: { search: "query", collectionId: "collection", limit: 24 }, signal });
  });
  it("passes cancellation for shared lists and full drawing exports", async () => {
    const signal = new AbortController().signal;
    await getSharedDrawings("query", { signal });
    expect(api.get).toHaveBeenNthCalledWith(1, "/drawings/shared", { params: { search: "query" }, signal });
    await getDrawings(undefined, undefined, { includeData: true, signal });
    expect(api.get).toHaveBeenNthCalledWith(2, "/drawings", { params: { includeData: "true" }, signal });
  });
});
