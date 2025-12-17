import { LaneIndex, Judgment } from './types';

// Keyboard mapping
export const KEYS: Record<string, LaneIndex> = {
  'ArrowLeft': 0,
  'ArrowUp': 1,
  'ArrowDown': 2,
  'ArrowRight': 3,
  'd': 0,
  'f': 1,
  'j': 2,
  'k': 3,
};

export const LANE_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308'  // Yellow
];

// Time windows in seconds (determines difficulty)
export const JUDGMENT_WINDOWS = {
  [Judgment.PERFECT]: 0.08, // +/- 80ms
  [Judgment.GOOD]: 0.15,    // +/- 150ms
  [Judgment.MISS]: 0.25     // +/- 250ms (cutoff)
};

export const SCORES = {
  [Judgment.PERFECT]: 300,
  [Judgment.GOOD]: 100,
  [Judgment.MISS]: 0
};

// Visual constants
export const NOTE_SIZE = 60; // width of note
export const HIT_LINE_Y_OFFSET = 100; // Distance from bottom
export const TRACK_WIDTH = 300; // Total width of the play area
export const LOOK_AHEAD_TIME = 2.0; // How many seconds ahead to render notes
