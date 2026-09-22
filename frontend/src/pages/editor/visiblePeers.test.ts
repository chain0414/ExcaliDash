import { describe, expect, it } from "vitest";
import { visiblePeers } from "./visiblePeers";

const me = { id: "owner", name: "wayne", initials: "WA", color: "#ef4444" };

describe("visiblePeers", () => {
  it("hides inactive and duplicate sessions of the current user", () => {
    expect(visiblePeers([
      { ...me, isActive: true },
      { ...me, id: "anon:other-tab", isActive: true },
      { ...me, id: "anon:idle-tab", isActive: false },
      { id: "guest", name: "Guest", initials: "GU", color: "#0ea5e9", isActive: true },
      { id: "guest", name: "Guest", initials: "GU", color: "#0ea5e9", isActive: true },
    ], me).map((peer) => peer.id)).toEqual(["guest"]);
  });
});
