const TEST_VIDEOS = "https://test-videos.co.uk/vids";

export const STOCK_MP4S: string[] = [
  `${TEST_VIDEOS}/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4`,
  `${TEST_VIDEOS}/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4`,
  `${TEST_VIDEOS}/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4`,
  "https://mdn.github.io/shared-assets/videos/flower.mp4",
  "https://media.w3.org/2010/05/video/movie_300.mp4",
  "https://media.w3.org/2010/05/sintel/trailer.mp4",
  "https://media.w3.org/2010/05/bunny/movie.mp4",
  "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
];

export function stockIndex(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % STOCK_MP4S.length;
}

export function mockJobId(text: string): string {
  return `mock-${stockIndex(text)}`;
}

export function stockClipForJob(jobId: string): string | null {
  const match = /^mock-(\d+)$/.exec(jobId);
  if (match === null) return null;
  return STOCK_MP4S[Number(match[1]) % STOCK_MP4S.length];
}
