import type { ThingKind } from './things';

export type Weather = 'clear' | 'cloudy' | 'mist' | 'snow' | 'rain';

export interface WorldStyle {
  seed?: number | string;
  timeOfDay?: number;
  palette?: { sky?: string; fog?: string; ground?: string; water?: string; accentLight?: string };
  weather?: Weather;
  landmarks?: { slot: ThingKind; name?: string; description?: string }[];
}

export const presets: Record<string, WorldStyle> = {
  'misty-dawn-coast': {
    timeOfDay: 6.1,
    palette: { sky: '#9cc3d6', fog: '#d9e3e6', water: '#1d4d5c' },
    weather: 'mist',
    landmarks: [
      { slot: 'lighthouse', name: 'The Dawn Light', description: 'A pale tower whose lamp still burns as the fog lifts off the sea.' },
      { slot: 'boat', name: 'The Fog Skiff', description: 'A small boat beached in the mist, its rope still wet.' },
    ],
  },
  'golden-meadow': {
    timeOfDay: 16.8,
    palette: { sky: '#7fb8dc', fog: '#e9e2c9', ground: '#b7c76a', water: '#245e6a' },
    weather: 'clear',
    landmarks: [
      { slot: 'well', name: 'The Wishing Well', description: 'An old stone well in a field of tall summer grass.' },
      { slot: 'cabin', name: 'The Beekeeper’s Cottage', description: 'A small cottage with hives along its wall and an open window.' },
    ],
  },
  'moonlit-snow': {
    timeOfDay: 22.4,
    palette: { sky: '#1a3a4a', fog: '#3d5d6b', ground: '#e8eef1', water: '#0b2630' },
    weather: 'snow',
    landmarks: [
      { slot: 'cabin', name: 'The Snowbound Cabin', description: 'A log cabin half buried in snow, one window glowing.' },
      { slot: 'stranger', name: 'The Wanderer in White', description: 'A cloaked traveler standing still in the falling snow.' },
    ],
  },
  'cloud-sea': {
    timeOfDay: 7.2,
    palette: { sky: '#8fc4e4', fog: '#f1f4f6', water: '#e9f0f4' },
    weather: 'cloudy',
    landmarks: [
      { slot: 'arch', name: 'The Sky Gate', description: 'A stone arch on the edge of an island above a sea of clouds.' },
      { slot: 'boat', name: 'The Cloud Skiff', description: 'A small boat drifting at the edge of the cloud sea, ready to sail.' },
      { slot: 'lighthouse', name: 'The Beacon Above the Clouds', description: 'A tall tower guiding ships that sail on cloud.' },
    ],
  },
};
