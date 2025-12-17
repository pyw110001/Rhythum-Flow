import React, { useState, useRef } from 'react';
import { Upload, Music, Loader2, Info } from 'lucide-react';
import { GameCanvas } from './components/GameCanvas';
import { analyzeAudio } from './services/audioAnalyzer';
import { AnalyzedTrack } from './types';

const App: React.FC = () => {
  const [analyzedTrack, setAnalyzedTrack] = useState<AnalyzedTrack | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset state
    setError(null);
    setIsAnalyzing(true);
    setAnalyzedTrack(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Analyze
      const result = await analyzeAudio(audioContext, arrayBuffer);
      
      setAnalyzedTrack({
        buffer: result.buffer,
        notes: result.notes,
        fileName: file.name.replace(/\.[^/.]+$/, ""), // remove extension
        duration: result.buffer.duration
      });

    } catch (err) {
      console.error(err);
      setError("Failed to process audio file. Please try a standard MP3 or WAV.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        // Create a synthetic event to reuse logic
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(e.dataTransfer.files[0]);
        if (fileInputRef.current) {
            fileInputRef.current.files = dataTransfer.files;
            handleFileUpload({ target: { files: dataTransfer.files } } as any);
        }
    }
  };

  if (analyzedTrack) {
    return <GameCanvas track={analyzedTrack} onExit={() => setAnalyzedTrack(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[100px] animate-pulse"></div>
         <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[100px] animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      <div className="max-w-md w-full z-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            RHYTHM FLOW
          </h1>
          <p className="text-slate-400">Upload your music. Play the beat.</p>
        </div>

        <div 
            className="border-2 border-dashed border-slate-700 bg-slate-900/50 rounded-2xl p-12 flex flex-col items-center justify-center hover:border-blue-500 transition-colors cursor-pointer group backdrop-blur-sm"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
        >
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="audio/*" 
                className="hidden" 
            />
            
            {isAnalyzing ? (
                <div className="text-center animate-pulse">
                    <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
                    <p className="text-lg font-medium text-blue-400">Analyzing Rhythm...</p>
                    <p className="text-sm text-slate-500">Extracting beats & generating chart</p>
                </div>
            ) : (
                <div className="text-center group-hover:scale-105 transition-transform duration-300">
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-600/20 group-hover:text-blue-400 transition-colors">
                        <Upload className="w-10 h-10 text-slate-300 group-hover:text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Drop Audio File</h3>
                    <p className="text-slate-400 text-sm mb-4">Supports MP3, WAV, OGG</p>
                    <span className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/50">Browse Files</span>
                </div>
            )}
        </div>
        
        {error && (
            <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-lg text-red-200 text-sm text-center">
                {error}
            </div>
        )}

        <div className="bg-slate-900/50 rounded-xl p-6 backdrop-blur-sm border border-slate-800">
            <h4 className="flex items-center gap-2 font-bold mb-4 text-slate-300">
                <Info size={16} /> How to Play
            </h4>
            <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                    <span className="bg-slate-800 px-2 rounded text-white font-mono">1</span>
                    Upload any music track. The game will automatically detect the beats.
                </li>
                <li className="flex items-start gap-2">
                    <span className="bg-slate-800 px-2 rounded text-white font-mono">2</span>
                    Use Arrow Keys <span className="text-white border border-slate-600 px-1 rounded text-xs mx-1">←</span> <span className="text-white border border-slate-600 px-1 rounded text-xs mx-1">↓</span> <span className="text-white border border-slate-600 px-1 rounded text-xs mx-1">↑</span> <span className="text-white border border-slate-600 px-1 rounded text-xs mx-1">→</span> or <span className="text-white border border-slate-600 px-1 rounded text-xs mx-1">DFJK</span> to hit notes as they reach the line.
                </li>
                <li className="flex items-start gap-2">
                    <span className="bg-slate-800 px-2 rounded text-white font-mono">3</span>
                    Maintain your combo for high scores!
                </li>
            </ul>
        </div>
      </div>
      
      <div className="absolute bottom-4 text-slate-600 text-xs text-center w-full">
         Rhythm Flow &copy; 2024 • Built with React & Web Audio API
      </div>
    </div>
  );
};

export default App;
