export const theme = {
  moonstone: '#E8EEF1',
  lagoon: '#0E2C36',
  lagoonDeep: '#071A21',
  blossom: '#FF8E9E',
  startHour: 17.9,
};

export interface SkyKey {
  t: number;
  zenith: string;
  horizon: string;
  haze: string;
  light: string;
  power: number;
  sky: string;
  ground: string;
  cloudLit: string;
  cloudShade: string;
  mountain: string;
}

export const skyKeys: SkyKey[] = [
  { t: 0, zenith: '#061820', horizon: '#1f4a55', haze: '#173b45', light: '#cfe0ea', power: .6, sky: '#3f6f7e', ground: '#0a2027', cloudLit: '#3a6a76', cloudShade: '#12313a', mountain: '#0f2d36' },
  { t: 4.6, zenith: '#0b2630', horizon: '#3f6a72', haze: '#2e5560', light: '#d6e6ee', power: .7, sky: '#5a8792', ground: '#122d34', cloudLit: '#5b8590', cloudShade: '#1b3c45', mountain: '#1a3c45' },
  { t: 6, zenith: '#4d86a0', horizon: '#f6d3c4', haze: '#c9d3d2', light: '#ffe2d6', power: 1.4, sky: '#b9d3dc', ground: '#4c5f5a', cloudLit: '#fff8f3', cloudShade: '#e2d8dc', mountain: '#8fa7b0' },
  { t: 8.5, zenith: '#4fa2cf', horizon: '#dff2f6', haze: '#c4e1ea', light: '#fffaf0', power: 2.3, sky: '#c6e3ee', ground: '#5d7360', cloudLit: '#ffffff', cloudShade: '#c3d6e2', mountain: '#94b8c6' },
  { t: 12, zenith: '#3c98d0', horizon: '#d9f0f7', haze: '#bcdde8', light: '#ffffff', power: 2.6, sky: '#c4e2ee', ground: '#627a62', cloudLit: '#ffffff', cloudShade: '#bfd5e2', mountain: '#8fb5c4' },
  { t: 16, zenith: '#4597c6', horizon: '#f1ecdd', haze: '#cddcd8', light: '#fff4e4', power: 2.2, sky: '#c9dee4', ground: '#5f735e', cloudLit: '#fffaf2', cloudShade: '#c4ccd6', mountain: '#98b3bc' },
  { t: 17.9, zenith: '#3a7a98', horizon: '#ffcbb6', haze: '#e3c4bb', light: '#ffd6c4', power: 1.7, sky: '#b4ccd2', ground: '#4f5a55', cloudLit: '#fff3ec', cloudShade: '#e0c2c6', mountain: '#7f97a3' },
  { t: 19.2, zenith: '#163f52', horizon: '#c99b98', haze: '#6f8890', light: '#f0c8c0', power: .9, sky: '#6f939c', ground: '#203a40', cloudLit: '#d8a6a4', cloudShade: '#3e5b66', mountain: '#33535d' },
  { t: 20.4, zenith: '#08202a', horizon: '#2b5a64', haze: '#1f4650', light: '#d6e6ee', power: .75, sky: '#527f8b', ground: '#0e262d', cloudLit: '#416f7a', cloudShade: '#143540', mountain: '#14343d' },
  { t: 24, zenith: '#061820', horizon: '#1f4a55', haze: '#173b45', light: '#cfe0ea', power: .6, sky: '#3f6f7e', ground: '#0a2027', cloudLit: '#3a6a76', cloudShade: '#12313a', mountain: '#0f2d36' },
];
