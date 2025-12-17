export type LaneIndex = 0 | 1 | 2 | 3;

export interface Note {
  id: string;
  time: number; // The exact time in the audio (in seconds) the note should be hit
  lane: LaneIndex;
  hit: boolean;
  missed: boolean;
  visible: boolean;
}

export enum Judgment {
  PERFECT = 'PERFECT',
  GOOD = 'GOOD',
  MISS = 'MISS',
  NONE = 'NONE'
}

export interface GameConfig {
  speed: number; // Notes travel speed (pixels per second implies, but strictly it's a multiplier)
  scrollSpeed: number; // Time (ms) from top to bottom
  audioOffset: number; // Audio latency compensation
}

export interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
}

export interface AnalyzedTrack {
  buffer: AudioBuffer;
  notes: Note[];
  fileName: string;
  duration: number;
}
