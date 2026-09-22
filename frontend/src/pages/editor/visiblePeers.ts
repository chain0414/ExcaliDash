import type { UserIdentity } from "../../utils/identity";

export interface PresencePeer extends UserIdentity {
  isActive: boolean;
}

export const visiblePeers = (
  peers: readonly PresencePeer[],
  me: UserIdentity,
): PresencePeer[] => {
  const seen = new Set<string>();
  return peers.filter((peer) => {
    if (!peer.isActive || peer.id === me.id) return false;
    // An expired socket cookie can turn another tab of the signed-in user into
    // an anonymous presence, while keeping the same display identity.
    if (peer.name === me.name && peer.color === me.color) return false;
    if (seen.has(peer.id)) return false;
    seen.add(peer.id);
    return true;
  });
};
