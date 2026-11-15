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
};

export function videoSource(url: string): VideoSource {
  return bundled[url] ?? { uri: url };
}

export function imageSource(url: string): number | { uri: string } {
  return bundled[url] ?? { uri: url };
}
