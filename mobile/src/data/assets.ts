import type { VideoSource } from "expo-video";

const bundled: Record<string, number> = {
  "mock://street": require("../../assets/mock/street.mp4"),
  "mock://car": require("../../assets/mock/car.mp4"),
  "mock://oldstreet": require("../../assets/mock/oldstreet.mp4"),
  "mock://overpass": require("../../assets/mock/overpass.mp4"),
  "mock://plant": require("../../assets/mock/plant.mp4"),
  "mock://stranger": require("../../assets/mock/stranger.mp4"),
  "mock://church": require("../../assets/mock/church.mp4"),
  "mock://redroom": require("../../assets/mock/redroom.mp4"),
  "mock://towers": require("../../assets/mock/towers.mp4"),
  "mock://lights": require("../../assets/mock/lights.mp4"),
  "mock://dawn": require("../../assets/mock/dawn.mp4"),
  "mock://tower": require("../../assets/mock/tower.mp4"),
  "mock://poster": require("../../assets/mock/poster.jpg"),
  "mock://voice/street": require("../../assets/mock/voice/street.m4a"),
  "mock://voice/car": require("../../assets/mock/voice/car.m4a"),
  "mock://voice/oldstreet": require("../../assets/mock/voice/oldstreet.m4a"),
  "mock://voice/overpass": require("../../assets/mock/voice/overpass.m4a"),
  "mock://voice/plant": require("../../assets/mock/voice/plant.m4a"),
  "mock://voice/stranger": require("../../assets/mock/voice/stranger.m4a"),
  "mock://voice/church": require("../../assets/mock/voice/church.m4a"),
  "mock://voice/redroom": require("../../assets/mock/voice/redroom.m4a"),
  "mock://voice/riddle": require("../../assets/mock/voice/riddle.m4a"),
  "mock://voice/reply": require("../../assets/mock/voice/reply.m4a"),
};

const clips = new Map<string, string>();
const downloads = new Set<string>();

export async function preloadClip(url: string) {
  if (bundled[url] || downloads.has(url)) return;
  downloads.add(url);
  try {
    const { Asset } = await import("expo-asset");
    const asset = await Asset.fromURI(url).downloadAsync();
    if (asset.localUri) clips.set(url, asset.localUri);
  } catch {
    downloads.delete(url);
  }
}

export function videoSource(url: string): VideoSource {
  return bundled[url] ?? { uri: clips.get(url) ?? url };
}

export function audioSource(url: string): number | { uri: string } {
  return bundled[url] ?? { uri: url };
}

export function imageSource(url: string): number | { uri: string } {
  return bundled[url] ?? { uri: url };
}
