import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, RotateCcw, Pause, Music, Volume2, VolumeX, SkipForward } from 'lucide-react';
import { Note, GameStats, AnalyzedTrack, Judgment, LaneIndex } from '../types';
import { LANE_COLORS, KEYS, JUDGMENT_WINDOWS, HIT_LINE_Y_OFFSET, SCORES, LOOK_AHEAD_TIME } from '../constants';

interface GameCanvasProps {
  track: AnalyzedTrack;
  onExit: () => void;
}

// Linear interpolation function for smoothness
const lerp = (start: number, end: number, factor: number) => {
  return start + (end - start) * factor;
};

export const GameCanvas: React.FC<GameCanvasProps> = ({ track, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  
  // Ref to store the current visual height of bars for smooth animation (LERP)
  const smoothDataRef = useRef<Float32Array | null>(null);

  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const notesRef = useRef<Note[]>(JSON.parse(JSON.stringify(track.notes))); // Deep copy to reset state
  
  // Game State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  // Stats State
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    good: 0,
    miss: 0
  });
  
  // Feedback Visuals
  const [lastJudgment, setLastJudgment] = useState<{ type: Judgment, text: string, color: string } | null>(null);
  const laneEffectsRef = useRef<number[]>([0, 0, 0, 0]); // Opacity of hit effect per lane

  // Configuration
  const NOTE_SPEED = 600; // Pixels per second
  const HIT_Y = window.innerHeight - HIT_LINE_Y_OFFSET;

  // --- Audio Control ---

  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  const playAudio = useCallback((offset: number = 0) => {
    initAudio();
    const ctx = audioContextRef.current!;
    
    // Stop existing source if any
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) { /* ignore */ }
    }

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    
    // Create Analyser for Visualizer
    const analyser = ctx.createAnalyser();
    // 256 fftSize = 128 bins. 
    // We will mirror them, so 128 bars total is a good density.
    analyser.fftSize = 256; 
    analyser.smoothingTimeConstant = 0.8; // We do custom LERP smoothing, so this can be lower
    analyserRef.current = analyser;
    
    const bufferLength = analyser.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);
    smoothDataRef.current = new Float32Array(bufferLength).fill(0);

    const gainNode = ctx.createGain();
    gainNode.gain.value = audioEnabled ? 1.0 : 0.0;
    
    // Connect Source -> Analyser -> Gain -> Destination
    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    source.start(0, offset);
    sourceNodeRef.current = source;
    
    startTimeRef.current = ctx.currentTime - offset;
    setIsPlaying(true);
    setIsPaused(false);
    
    // Cleanup on end
    source.onended = () => {
        if (ctx.currentTime - startTimeRef.current >= track.duration - 0.5) {
            setIsFinished(true);
            setIsPlaying(false);
        }
    };
  }, [track.buffer, track.duration, audioEnabled, initAudio]);

  const pauseGame = useCallback(() => {
    if (!audioContextRef.current || !isPlaying) return;
    if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
    }
    pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
    setIsPlaying(false);
    setIsPaused(true);
  }, [isPlaying]);

  const resumeGame = useCallback(() => {
    playAudio(pauseTimeRef.current);
  }, [playAudio]);

  const restartGame = useCallback(() => {
    if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(e) {/* ignore */}
    }
    
    // Reset Logic
    notesRef.current = JSON.parse(JSON.stringify(track.notes));
    setStats({
        score: 0,
        combo: 0,
        maxCombo: 0,
        perfect: 0,
        good: 0,
        miss: 0
    });
    setLastJudgment(null);
    setIsFinished(false);
    pauseTimeRef.current = 0;
    
    // Slight delay before start
    setTimeout(() => {
        playAudio(0);
    }, 500);
  }, [track.notes, playAudio]);

  // --- Input Handling ---

  const handleInput = useCallback((lane: LaneIndex) => {
    if (!isPlaying || isPaused) return;

    const ctx = audioContextRef.current;
    if (!ctx) return;

    const currentTime = ctx.currentTime - startTimeRef.current;
    
    // Flash effect
    laneEffectsRef.current[lane] = 1.0;

    // Find closest visible note in lane
    const notes = notesRef.current;
    
    // Find the first unhit note in the lane that is within the miss window
    const targetNoteIndex = notes.findIndex(n => 
        n.lane === lane && 
        !n.hit && 
        !n.missed && 
        Math.abs(n.time - currentTime) <= JUDGMENT_WINDOWS[Judgment.MISS]
    );

    if (targetNoteIndex !== -1) {
      const note = notes[targetNoteIndex];
      const diff = Math.abs(note.time - currentTime);
      
      let judgment = Judgment.MISS;
      if (diff <= JUDGMENT_WINDOWS[Judgment.PERFECT]) judgment = Judgment.PERFECT;
      else if (diff <= JUDGMENT_WINDOWS[Judgment.GOOD]) judgment = Judgment.GOOD;
      
      // Update State
      notes[targetNoteIndex].hit = true;
      
      // Update Stats
      setStats(prev => {
        const newCombo = judgment === Judgment.MISS ? 0 : prev.combo + 1;
        return {
            ...prev,
            score: prev.score + SCORES[judgment] + (newCombo > 10 ? Math.floor(newCombo / 10) * 10 : 0),
            combo: newCombo,
            maxCombo: Math.max(prev.maxCombo, newCombo),
            perfect: judgment === Judgment.PERFECT ? prev.perfect + 1 : prev.perfect,
            good: judgment === Judgment.GOOD ? prev.good + 1 : prev.good,
            miss: judgment === Judgment.MISS ? prev.miss + 1 : prev.miss,
        };
      });

      // Feedback
      if (judgment === Judgment.PERFECT) setLastJudgment({ type: Judgment.PERFECT, text: 'PERFECT', color: '#60a5fa' });
      else if (judgment === Judgment.GOOD) setLastJudgment({ type: Judgment.GOOD, text: 'GOOD', color: '#4ade80' });
      else setLastJudgment({ type: Judgment.MISS, text: 'MISS', color: '#9ca3af' });

    }
  }, [isPlaying, isPaused]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (KEYS[e.key] !== undefined) {
        handleInput(KEYS[e.key]);
      } else if (e.code === 'Space') {
          if (isPlaying) pauseGame();
          else if (isPaused) resumeGame();
      } else if (e.key === 'Escape') {
          onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInput, isPlaying, isPaused, pauseGame, resumeGame, onExit]);


  // --- Game Loop & Rendering ---

  useEffect(() => {
    let animationFrameId: number;
    let hueOffset = 0; // For color cycling

    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      // Responsive sizing
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;
      const LANE_WIDTH = Math.min(WIDTH / 4, 100); 
      const TOTAL_TRACK_WIDTH = LANE_WIDTH * 4;
      const START_X = (WIDTH - TOTAL_TRACK_WIDTH) / 2;
      const JUDGMENT_Y = HEIGHT - HIT_LINE_Y_OFFSET;

      // Clear
      ctx.fillStyle = '#020617'; 
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // --- ADVANCED RAINBOW VISUALIZER ---
      if (isPlaying && analyserRef.current && dataArrayRef.current && smoothDataRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        
        const bufferLength = analyserRef.current.frequencyBinCount;
        const centerX = WIDTH / 2;
        // Make bars wider to fill space nicely
        const barWidth = (WIDTH / bufferLength) * 1.5; 
        
        const HORIZON = HEIGHT * 0.85; // Lower horizon
        const MAX_HEIGHT = HEIGHT * 0.55;

        // Cycle rainbow color over time
        hueOffset += 0.5;

        // LERP Factor (0.1 = very slow/smooth, 0.3 = fast/snappy)
        const SMOOTH_FACTOR = 0.2; 

        for (let i = 0; i < bufferLength; i++) {
          // 1. Smooth Interpolation
          const targetValue = dataArrayRef.current[i];
          const currentValue = smoothDataRef.current[i];
          // Lerp current value towards target
          const newValue = lerp(currentValue, targetValue, SMOOTH_FACTOR);
          smoothDataRef.current[i] = newValue;

          // 2. Determine Dimensions
          const percent = newValue / 255;
          const height = Math.max(percent * MAX_HEIGHT, 2); 

          // 3. Dynamic Rainbow Color
          // i/bufferLength gives 0 to 1 position across spectrum
          // hueOffset makes it flow
          const hue = (i / bufferLength * 300) + hueOffset; 
          
          const xRight = centerX + (i * barWidth);
          const xLeft = centerX - ((i + 1) * barWidth);

          // 4. Draw Beams (Upwards) with Gradient
          const gradSky = ctx.createLinearGradient(0, HORIZON, 0, HORIZON - height);
          gradSky.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.8)`); // Bright base
          gradSky.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);   // Fade to transparent
          
          ctx.fillStyle = gradSky;
          // Right
          ctx.fillRect(xRight, HORIZON - height, barWidth - 1, height);
          // Left (Mirrored)
          ctx.fillRect(xLeft, HORIZON - height, barWidth - 1, height);

          // 5. Draw Reflection (Downwards)
          // Reflection is shorter and more transparent
          const reflectHeight = height * 0.5;
          const gradReflect = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + reflectHeight);
          gradReflect.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.3)`); 
          gradReflect.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);

          ctx.fillStyle = gradReflect;
          // Right
          ctx.fillRect(xRight, HORIZON, barWidth - 1, reflectHeight);
          // Left
          ctx.fillRect(xLeft, HORIZON, barWidth - 1, reflectHeight);
        }
        
        // Add a "Horizon Line" glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsla(${hueOffset}, 100%, 80%, 0.5)`;
        ctx.fillStyle = `hsla(${hueOffset}, 100%, 90%, 0.5)`;
        ctx.fillRect(0, HORIZON - 1, WIDTH, 2);
        ctx.shadowBlur = 0;
      }
      // -----------------------------

      // Draw Lanes Overlay (Semi-transparent to see visualizer behind)
      for (let i = 0; i < 4; i++) {
        const x = START_X + i * LANE_WIDTH;
        
        // Lane Background (Darker to pop notes)
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x, 0, LANE_WIDTH, HEIGHT);
        
        // Key Indicator / Hit effect
        const opacity = laneEffectsRef.current[i];
        if (opacity > 0) {
            // Gradient hit effect
            const gradient = ctx.createLinearGradient(x, JUDGMENT_Y, x, JUDGMENT_Y - 250);
            gradient.addColorStop(0, `${LANE_COLORS[i]}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, JUDGMENT_Y - 250, LANE_WIDTH, 250);
            
            // Key Highlight
            ctx.fillStyle = LANE_COLORS[i];
            ctx.globalAlpha = opacity * 0.8;
            ctx.fillRect(x, JUDGMENT_Y, LANE_WIDTH, 15);
            ctx.globalAlpha = 1.0;

            // Decay
            laneEffectsRef.current[i] = Math.max(0, opacity - 0.08);
        }

        // Hit Line Marker
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, JUDGMENT_Y);
        ctx.lineTo(x + LANE_WIDTH, JUDGMENT_Y);
        ctx.stroke();

        // Key Hint
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        const keyLabels = ['←', '↑', '↓', '→'];
        ctx.fillText(keyLabels[i], x + LANE_WIDTH / 2, JUDGMENT_Y + 30);
      }

      // Time Calculation
      let currentTime = 0;
      if (audioContextRef.current) {
         currentTime = isPlaying 
            ? audioContextRef.current.currentTime - startTimeRef.current 
            : pauseTimeRef.current;
      }

      // Draw Notes
      const notes = notesRef.current;
      
      notes.forEach(note => {
        if (note.hit) return;

        if (!note.missed && currentTime > note.time + JUDGMENT_WINDOWS[Judgment.MISS]) {
             note.missed = true;
             setStats(prev => ({
                ...prev,
                combo: 0,
                miss: prev.miss + 1
             }));
             setLastJudgment({ type: Judgment.MISS, text: 'MISS', color: '#9ca3af' });
        }

        if (note.missed) return; 

        const timeDiff = note.time - currentTime;
        
        if (timeDiff > LOOK_AHEAD_TIME || timeDiff < -0.2) return;

        const y = JUDGMENT_Y - (timeDiff * NOTE_SPEED);
        const x = START_X + note.lane * LANE_WIDTH;

        // Draw Note Body (Neon Style)
        const color = LANE_COLORS[note.lane];
        
        // Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        
        ctx.fillStyle = color;
        ctx.fillRect(x + 4, y - 8, LANE_WIDTH - 8, 16);
        
        ctx.shadowBlur = 0;

        // Bright Center
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x + 8, y - 4, LANE_WIDTH - 16, 8);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, isPaused]); // Minimal dependencies for the loop to avoid recreation

  // --- Rendering UI Components ---

  // Result Screen
  if (isFinished) {
    const totalNotes = track.notes.length;
    const accuracy = Math.round(((stats.score) / (totalNotes * 300)) * 100) || 0;
    
    let grade = 'F';
    if (accuracy >= 95) grade = 'S';
    else if (accuracy >= 90) grade = 'A';
    else if (accuracy >= 80) grade = 'B';
    else if (accuracy >= 70) grade = 'C';
    else if (accuracy >= 60) grade = 'D';

    return (
        <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center z-50 p-8">
            <h1 className="text-4xl font-bold mb-2 text-white">TRACK COMPLETE</h1>
            <h2 className="text-xl text-slate-400 mb-8">{track.fileName}</h2>
            
            <div className="text-8xl font-black mb-8 bg-clip-text text-transparent bg-gradient-to-br from-yellow-400 to-red-600 animate-pulse">
                {grade}
            </div>
            
            <div className="grid grid-cols-2 gap-x-12 gap-y-4 text-lg mb-8">
                <div className="text-right text-slate-400">Score</div>
                <div className="text-white font-mono text-2xl">{stats.score.toLocaleString()}</div>
                
                <div className="text-right text-slate-400">Max Combo</div>
                <div className="text-yellow-400 font-mono text-2xl">{stats.maxCombo}</div>
                
                <div className="text-right text-blue-400">Perfect</div>
                <div className="text-white font-mono">{stats.perfect}</div>
                
                <div className="text-right text-green-400">Good</div>
                <div className="text-white font-mono">{stats.good}</div>
                
                <div className="text-right text-red-400">Miss</div>
                <div className="text-white font-mono">{stats.miss}</div>
            </div>

            <div className="flex gap-4">
                <button onClick={restartGame} className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition">
                    <RotateCcw size={20} /> Replay
                </button>
                <button onClick={onExit} className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition">
                    Choose Song
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-950 select-none cursor-default">
        {/* Canvas Layer */}
        <canvas ref={canvasRef} className="block w-full h-full" />
        
        {/* UI Overlay */}
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
            <div className="flex flex-col">
                <div className="text-3xl font-bold font-mono text-white drop-shadow-lg">{stats.score.toLocaleString()}</div>
                <div className="text-sm text-slate-400 font-mono">{track.fileName}</div>
            </div>
            <div className="flex flex-col items-end">
                <div className={`text-4xl font-black font-mono transition-transform duration-100 ${stats.combo > 0 ? 'scale-110' : 'scale-100'}`} style={{color: stats.combo > 20 ? '#fbbf24' : 'white'}}>
                    {stats.combo > 0 ? `${stats.combo}x` : ''}
                </div>
            </div>
        </div>

        {/* Judgment Feedback */}
        {lastJudgment && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-10">
                <div 
                    className="text-4xl font-black tracking-widest animate-bounce" 
                    style={{ color: lastJudgment.color, textShadow: `0 0 20px ${lastJudgment.color}` }}
                >
                    {lastJudgment.text}
                </div>
            </div>
        )}
        
        {/* Pause Overlay */}
        {isPaused && !isFinished && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                <h2 className="text-3xl font-bold mb-8 tracking-widest">PAUSED</h2>
                <div className="flex gap-6">
                     <button onClick={resumeGame} className="bg-green-600 p-4 rounded-full hover:bg-green-500 transition shadow-lg hover:scale-105">
                        <Play size={32} fill="white" />
                     </button>
                     <button onClick={restartGame} className="bg-yellow-600 p-4 rounded-full hover:bg-yellow-500 transition shadow-lg hover:scale-105">
                        <RotateCcw size={32} />
                     </button>
                     <button onClick={onExit} className="bg-red-600 p-4 rounded-full hover:bg-red-500 transition shadow-lg hover:scale-105">
                        <SkipForward size={32} />
                     </button>
                </div>
            </div>
        )}

        {/* Initial Start Overlay */}
        {!isPlaying && !isPaused && !isFinished && (
             <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30">
                <div className="text-center mb-8">
                    <Music className="w-16 h-16 mx-auto mb-4 text-blue-400" />
                    <h2 className="text-2xl font-bold mb-2">{track.fileName}</h2>
                    <p className="text-slate-400">{track.notes.length} notes detected</p>
                </div>
                <button 
                    onClick={() => playAudio(0)}
                    className="group relative px-8 py-4 bg-blue-600 rounded-full font-bold text-xl hover:bg-blue-500 transition-all hover:scale-110 shadow-[0_0_20px_rgba(37,99,235,0.5)]"
                >
                    <span className="flex items-center gap-2">
                        <Play fill="white" /> START
                    </span>
                </button>
                <div className="mt-8 text-slate-500 text-sm grid grid-cols-2 gap-x-8 gap-y-2 text-left">
                    <span>LANE 1: Left / D</span>
                    <span>LANE 2: Up / F</span>
                    <span>LANE 3: Down / J</span>
                    <span>LANE 4: Right / K</span>
                </div>
             </div>
        )}

        {/* Mobile Controls (Overlay) */}
        <div className="absolute bottom-0 left-0 w-full h-32 grid grid-cols-4 gap-2 p-2 sm:hidden z-10 pointer-events-auto">
             {[0,1,2,3].map((i) => (
                 <div 
                    key={i}
                    className="border-t-2 border-white/20 bg-gradient-to-t from-white/10 to-transparent active:bg-white/20 touch-none"
                    onTouchStart={(e) => { e.preventDefault(); handleInput(i as LaneIndex); }}
                 ></div>
             ))}
        </div>
        
        {/* Utility Controls */}
        <div className="absolute top-4 right-4 z-40 flex gap-2 pointer-events-auto">
            <button 
                onClick={() => setAudioEnabled(!audioEnabled)} 
                className="p-2 bg-slate-800/80 rounded hover:bg-slate-700 text-white transition"
            >
                {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button 
                onClick={pauseGame} 
                className="p-2 bg-slate-800/80 rounded hover:bg-slate-700 text-white transition"
                disabled={!isPlaying}
            >
                <Pause size={20} />
            </button>
        </div>
    </div>
  );
};