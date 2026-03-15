/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Video, 
  Image as ImageIcon, 
  Settings, 
  Download, 
  Loader2, 
  Sparkles, 
  AlertCircle,
  ChevronRight,
  Maximize2,
  RefreshCw
} from 'lucide-react';

// --- Types ---
type Resolution = '720p' | '1080p';
type AspectRatio = '16:9' | '9:16';

interface GenerationState {
  status: 'idle' | 'loading' | 'polling' | 'success' | 'error';
  message: string;
  error?: string;
  videoUrl?: string;
}

// --- Constants ---
const LOADING_MESSAGES = [
  "Dreaming up your scene...",
  "Painting pixels with light...",
  "Composing the cinematic motion...",
  "Almost there, adding the final touches...",
  "Your vision is coming to life..."
];

const TEMPLATES = [
  { id: 'anime', name: 'Anime', icon: '🎨', prompt: 'In a vibrant anime style, high quality, detailed cel shading, emotional atmosphere' },
  { id: '3d', name: '3D Animation', icon: '🧊', prompt: 'High-end 3D animation style, Pixar inspired, soft lighting, detailed textures' },
  { id: '2d', name: '2D Animation', icon: '✏️', prompt: 'Hand-drawn 2D animation style, charming character design, fluid motion' },
  { id: 'realistic', name: 'Realistic', icon: '📸', prompt: 'Photorealistic cinematic style, 8k resolution, natural lighting, highly detailed' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '🌃', prompt: 'Cyberpunk aesthetic, neon lights, rainy streets, futuristic atmosphere' },
  { id: 'fantasy', name: 'Fantasy', icon: '🧙', prompt: 'Epic fantasy style, magical atmosphere, ethereal lighting, mythical creatures' },
];

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState<Resolution>('720p');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle', message: '' });
  const [messageIndex, setMessageIndex] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<{ name: string, type: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGifMode, setIsGifMode] = useState(false);
  const pollingRef = useRef<boolean>(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  const resetGeneration = () => {
    setGeneration({ status: 'idle', message: '' });
    setPrompt('');
    setImage(null);
    setReferenceFile(null);
    pollingRef.current = false;
  };

  const cancelGeneration = () => {
    pollingRef.current = false;
    setGeneration({ status: 'idle', message: '' });
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (generation.status === 'loading' || generation.status === 'polling') {
      interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [generation.status]);

  const checkApiKey = async () => {
    const selected = await window.aistudio.hasSelectedApiKey();
    setHasKey(selected);
  };

  const handleSelectKey = async () => {
    await window.aistudio.openSelectKey();
    setHasKey(true);
  };

  const processFile = (file: File) => {
    setReferenceFile({ name: file.name, type: file.type });
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImage(null); // Clear image if it's a PDF or other file
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const applyTemplate = (templatePrompt: string) => {
    if (prompt) {
      setPrompt(`${prompt}, ${templatePrompt}`);
    } else {
      setPrompt(templatePrompt);
    }
  };

  const generateVideo = async () => {
    if (!prompt.trim()) return;
    
    setGeneration({ status: 'loading', message: LOADING_MESSAGES[0] });
    pollingRef.current = true;
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const finalPrompt = isGifMode 
        ? `${prompt}. Short, loopable animation, cinemagraph style.`
        : prompt;

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: finalPrompt,
        image: image ? {
          imageBytes: image.split(',')[1],
          mimeType: image.split(';')[0].split(':')[1],
        } : undefined,
        config: {
          numberOfVideos: 1,
          resolution: resolution,
          aspectRatio: aspectRatio
        }
      });

      if (!pollingRef.current) return;
      setGeneration(prev => ({ ...prev, status: 'polling' }));

      // Poll for completion
      while (!operation.done && pollingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        if (!pollingRef.current) break;
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      if (!pollingRef.current) return;

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      
      if (downloadLink) {
        // Fetch the video with the API key
        const response = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': process.env.GEMINI_API_KEY || '',
          },
        });
        
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);
        setGeneration({ status: 'success', message: 'Video generated successfully!', videoUrl });
      } else {
        throw new Error('No video URL returned from the model.');
      }

    } catch (error: any) {
      console.error('Generation failed:', error);
      let errorMessage = 'Failed to generate video. Please try again.';
      if (error.message?.includes('Requested entity was not found')) {
        setHasKey(false);
        errorMessage = 'API Key issue. Please re-select your API key.';
      }
      setGeneration({ status: 'error', message: errorMessage, error: error.message });
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md space-y-8"
        >
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center border border-blue-500/20">
              <Video className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-light tracking-tight">ENVISION - MJ</h1>
            <p className="text-zinc-500 text-lg">
              To start generating cinematic videos, you need to select a paid Google Cloud project API key.
            </p>
          </div>
          <div className="space-y-4">
            <button 
              onClick={handleSelectKey}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 transition-colors rounded-xl font-medium text-lg flex items-center justify-center gap-2 text-white"
            >
              Select API Key
              <ChevronRight className="w-5 h-5" />
            </button>
            <p className="text-xs text-zinc-400">
              Requires a paid project. See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">billing documentation</a>.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-blue-500/10">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-100 blur-[120px] rounded-full" />
      </div>

      <header className="relative z-10 border-b border-zinc-100 backdrop-blur-md bg-white/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-medium tracking-tight">ENVISION - MJ</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleSelectKey}
            className="text-xs uppercase tracking-widest text-zinc-400 hover:text-blue-600 transition-colors"
          >
            Change Key
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 p-6 lg:p-12">
        {/* Left Column: Preview & Results */}
        <div className="space-y-8">
          <div className="aspect-video bg-zinc-50 rounded-3xl border border-zinc-100 overflow-hidden relative group shadow-sm">
            <AnimatePresence mode="wait">
              {generation.status === 'idle' && (
                <motion.div 
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400"
                >
                  <Video className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg font-light">Your masterpiece will appear here</p>
                </motion.div>
              )}

              {(generation.status === 'loading' || generation.status === 'polling') && (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm"
                >
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                    <Sparkles className="w-6 h-6 text-blue-400 absolute -top-2 -right-2 animate-pulse" />
                  </div>
                  <motion.p 
                    key={messageIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-6 text-xl font-light text-zinc-700"
                  >
                    {LOADING_MESSAGES[messageIndex]}
                  </motion.p>
                  <p className="mt-2 text-xs text-zinc-400 uppercase tracking-widest">
                    This usually takes 1-3 minutes
                  </p>
                  <button 
                    onClick={cancelGeneration}
                    className="mt-8 px-6 py-2 border border-zinc-200 hover:bg-zinc-50 rounded-full text-xs uppercase tracking-widest text-zinc-500 transition-colors"
                  >
                    Cancel Generation
                  </button>
                </motion.div>
              )}

              {generation.status === 'success' && generation.videoUrl && (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0"
                >
                  <video 
                    src={generation.videoUrl} 
                    controls 
                    autoPlay 
                    loop 
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={resetGeneration}
                      className="p-2 bg-white/80 backdrop-blur-md rounded-full hover:bg-zinc-100 transition-colors flex items-center gap-2 px-4 shadow-sm border border-zinc-100"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-600" />
                      <span className="text-xs font-medium text-zinc-600">New Project</span>
                    </button>
                    <a 
                      href={generation.videoUrl} 
                      download="envision-mj-gen.mp4"
                      className="p-2 bg-blue-600 rounded-full hover:bg-blue-500 transition-colors text-white shadow-sm"
                    >
                      <Download className="w-5 h-5" />
                    </a>
                  </div>
                </motion.div>
              )}

              {generation.status === 'error' && (
                <motion.div 
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
                >
                  <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                  <h3 className="text-xl font-medium text-red-600 mb-2">Generation Failed</h3>
                  <p className="text-zinc-500 max-w-md">{generation.message}</p>
                  <button 
                    onClick={() => setGeneration({ status: 'idle', message: '' })}
                    className="mt-6 px-6 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors flex items-center gap-2 text-zinc-700"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Prompt Input Area */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`bg-white border rounded-3xl p-6 space-y-4 transition-all duration-300 relative shadow-sm ${isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' : 'border-zinc-100'}`}
          >
            {isDragging && (
              <div className="absolute inset-0 bg-blue-500/5 backdrop-blur-[2px] rounded-3xl flex items-center justify-center z-20 pointer-events-none">
                <div className="flex flex-col items-center gap-2">
                  <Download className="w-10 h-10 text-blue-600 animate-bounce" />
                  <p className="text-blue-600 font-medium">Drop to attach reference</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">The Vision</span>
            </div>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A cinematic drone shot of a neon-lit cyberpunk city in the rain, hyper-realistic, 8k..."
              className="w-full bg-transparent border-none focus:ring-0 text-xl font-light placeholder:text-zinc-300 resize-none h-32 text-zinc-800"
            />
            
            {/* Templates Section */}
            <div className="pt-4 border-t border-zinc-50">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3 block">Style Templates</label>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => applyTemplate(template.prompt)}
                    className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-lg text-xs text-zinc-600 transition-colors flex items-center gap-2"
                  >
                    <span>{template.icon}</span>
                    {template.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-zinc-50">
              <div className="flex gap-4 items-center">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${referenceFile ? 'border-blue-500/50 bg-blue-500/5 text-blue-600' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-500'}`}
                >
                  <ImageIcon className="w-4 h-4" />
                  <span className="text-sm">
                    {referenceFile ? (referenceFile.name.length > 15 ? referenceFile.name.substring(0, 12) + '...' : referenceFile.name) : 'Reference File'}
                  </span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*,.pdf" 
                  className="hidden" 
                />
                {referenceFile && (
                  <button 
                    onClick={() => { setImage(null); setReferenceFile(null); }}
                    className="text-xs text-zinc-400 hover:text-zinc-600 underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <button 
                onClick={generateVideo}
                disabled={!prompt || generation.status === 'loading' || generation.status === 'polling'}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all rounded-full font-medium flex items-center gap-2 text-white shadow-md shadow-blue-500/10"
              >
                {generation.status === 'loading' || generation.status === 'polling' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Generate Video
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Settings */}
        <aside className="space-y-8">
          <div className="bg-white border border-zinc-100 rounded-3xl p-8 space-y-8 shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500">
              <Settings className="w-5 h-5" />
              <h2 className="font-medium">Configuration</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">GIF Mode</label>
                  <button 
                    onClick={() => setIsGifMode(!isGifMode)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${isGifMode ? 'bg-blue-600' : 'bg-zinc-200'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isGifMode ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 leading-tight">
                  Optimizes for short, loopable animations from images.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Resolution</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['720p', '1080p'] as Resolution[]).map((res) => (
                    <button
                      key={res}
                      onClick={() => setResolution(res)}
                      className={`py-3 rounded-xl border transition-all text-sm ${resolution === res ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-zinc-100 bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
                    >
                      <div className="text-[10px] opacity-50 mb-1 uppercase tracking-tighter">
                        {res === '720p' ? 'Standard' : 'High Def'}
                      </div>
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Aspect Ratio</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['16:9', '9:16'] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-3 rounded-xl border transition-all text-sm flex flex-col items-center gap-2 ${aspectRatio === ratio ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-zinc-100 bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
                    >
                      <div className={`border-2 rounded-sm ${ratio === '16:9' ? 'w-6 h-4' : 'w-4 h-6'} ${aspectRatio === ratio ? 'border-blue-500' : 'border-zinc-300'}`} />
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-50">
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    <span className="text-blue-600 font-medium">Pro Tip:</span> Use descriptive adjectives like "cinematic", "dreamy", or "hyper-realistic" for better results.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4">
            <p className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] text-center">
              Powered by Google Veo 3.1
            </p>
          </div>
        </aside>
      </main>

      <footer className="relative z-10 border-t border-zinc-100 py-8 mt-8">
        <div className="max-w-7xl mx-auto px-6 flex justify-center">
          <p className="text-sm text-zinc-400 font-light tracking-wide">
            Tool Architect : <span className="text-zinc-600 font-medium">Manoj Vasudev</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
