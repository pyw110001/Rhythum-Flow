import { Note, LaneIndex } from '../types';

/**
 * Analyzes audio buffer to detect beats using a dynamic threshold energy algorithm.
 * This is more robust than simple volume thresholding as it adapts to the song's loudness changes.
 */
export const analyzeAudio = async (audioContext: AudioContext, arrayBuffer: ArrayBuffer): Promise<{ buffer: AudioBuffer; notes: Note[] }> => {
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Use a smaller buffer size for analysis precision, but not too small to be noisy
  // 1024 samples @ 44.1kHz is ~23ms.
  const SIZE = 2048; 
  const data = audioBuffer.getChannelData(0); // Analyze left channel
  
  const notes: Note[] = [];
  const energyHistory: number[] = [];
  const HISTORY_SIZE = 43; // Approx 1 second of history at 44.1kHz with 1024 buffer. 43 * 23ms ~= 1s
  
  // Constants for detection
  const MULTIPLIER = 1.4; // Threshold multiplier. 1.3 - 1.5 is standard for pop music.
  const MIN_THRESHOLD = 0.05; // Minimum sound level to even consider
  const MIN_NOTE_GAP = 0.15; // Minimum 150ms between notes (limit to ~400BPM)

  let lastNoteTime = 0;

  // We loop through the PCM data in chunks
  for (let i = 0; i < data.length - SIZE; i += SIZE) {
    // 1. Compute RMS (Root Mean Square) energy of this chunk
    let sum = 0;
    for (let j = 0; j < SIZE; j++) {
      const val = data[i + j];
      sum += val * val;
    }
    const rms = Math.sqrt(sum / SIZE);

    // 2. Compute local average energy from history
    let localAverage = 0;
    if (energyHistory.length > 0) {
       localAverage = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
    }

    // 3. Update history
    energyHistory.push(rms);
    if (energyHistory.length > HISTORY_SIZE) {
      energyHistory.shift();
    }

    // 4. Beat Detection Logic
    // If instant energy is significantly higher than local average, it's an onset.
    // Also check against a minimum silence threshold.
    if (rms > localAverage * MULTIPLIER && rms > MIN_THRESHOLD) {
        const time = i / audioBuffer.sampleRate;
        
        if (time - lastNoteTime > MIN_NOTE_GAP) {
            // It is a confirmed beat
            
            // 5. Intelligent Lane Mapping
            // Instead of pure random, we use a deterministic pattern based on time
            // causing flows and stairs.
            const beatIndex = notes.length;
            let lane: LaneIndex = 0;

            // Simple pattern generator based on beat count
            // Every 8 beats, switch pattern type
            const patternType = Math.floor(beatIndex / 8) % 4;
            const subIndex = beatIndex % 8;

            if (patternType === 0) {
                // Stairs: 0-1-2-3-0-1-2-3
                lane = (subIndex % 4) as LaneIndex;
            } else if (patternType === 1) {
                // ZigZag: 0-1-0-1 or 2-3-2-3
                const base = (beatIndex % 16 < 8) ? 0 : 2;
                lane = (base + (subIndex % 2)) as LaneIndex;
            } else if (patternType === 2) {
                // Reverse Stairs: 3-2-1-0
                lane = (3 - (subIndex % 4)) as LaneIndex;
            } else {
                // Random-ish but wide
                lane = (Math.floor(time * 100) % 4) as LaneIndex;
            }

            // High intensity override?
            // If the beat is HUGE (2x average), maybe emphasize it or reset pattern?
            // For now, keep it simple to avoid "impossible" patterns.

            notes.push({
                id: `note-${beatIndex}`,
                time: time,
                lane: lane,
                hit: false,
                missed: false,
                visible: true
            });

            lastNoteTime = time;
        }
    }
  }

  return { buffer: audioBuffer, notes };
};