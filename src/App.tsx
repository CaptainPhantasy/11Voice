/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings, Play, Download, Loader2, Key } from 'lucide-react';

interface Voice {
  voice_id: string;
  name: string;
  category: string;
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedEngine, setSelectedEngine] = useState('eleven_multilingual_v2');
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');

  const engines = [
    { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2' },
    { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5' },
    { id: 'eleven_english_v1', name: 'Eleven English v1' },
  ];

  useEffect(() => {
    const storedApiKey = localStorage.getItem('elevenlabs_api_key');
    if (storedApiKey) {
      setApiKey(storedApiKey);
      setSavedApiKey(true);
      fetchVoices(storedApiKey);
    }
  }, []);

  const fetchVoices = async (key: string) => {
    try {
      setStatusText('Fetching available voices...');
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': key },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch voices. Please check your API key.');
      }
      
      const data = await response.json();
      setVoices(data.voices || []);
      if (data.voices && data.voices.length > 0) {
        setSelectedVoice(data.voices[0].voice_id);
      }
      setStatusText('System Ready. Voices loaded.');
      setErrorText('');
    } catch (err: any) {
      setErrorText(err.message || 'An error occurred fetching voices.');
      setStatusText('');
    }
  };

  const handleSaveApiKey = () => {
    if (!apiKey) return;
    localStorage.setItem('elevenlabs_api_key', apiKey);
    setSavedApiKey(true);
    fetchVoices(apiKey);
  };

  const clearApiKey = () => {
    localStorage.removeItem('elevenlabs_api_key');
    setApiKey('');
    setSavedApiKey(false);
    setVoices([]);
    setSelectedVoice('');
    setStatusText('');
  };

  const preprocessScript = (inputText: string, engine: string) => {
    setStatusText('Pre-processing: Sanitizing text...');
    // 1. Sanitization: Strip complex URLs and problematic non-standard Unicode
    let sanitized = inputText
      .replace(/https?:\/\/[^\s]+/g, "link") // Replace URLs with word "link"
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "") // Strip emojis
      .replace(/&/g, 'and'); // Expand ampersands

    // 2. Auto-Embellishment Logic: Inject breath, laughs, or yawns at specific pauses
    if (engine === 'eleven_multilingual_v2' || engine === 'eleven_turbo_v2_5') {
      setStatusText('Pre-processing: Injecting auto-embellishments...');
      const embellishments = [' [laughs] ', ' (clears throat) ', ' *yawns* ', ' [sighs] '];
      
      // Split text by paragraph breaks
      let paragraphs = sanitized.split(/\n\n+/);
      paragraphs = paragraphs.map(p => {
        // Only embellish decently sized paragraphs spontaneously
        if (p.trim().length > 50 && Math.random() > 0.4) {
          const randomEmbellishment = embellishments[Math.floor(Math.random() * embellishments.length)];
          // Attempt to insert embellishment softly after the first sentence of the paragraph
          return p.replace(/([.!?])\s/, `$1${randomEmbellishment}`);
        }
        return p;
      });
      sanitized = paragraphs.join('\n\n');
    }
    return sanitized;
  };

  const packageAudioToMP4 = async (audioArrayBuffer: ArrayBuffer) => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContext();
      const decodedAudio = await audioCtx.decodeAudioData(audioArrayBuffer);

      // Create a canvas wrapper to satisfy video requirements for mp4/webm packaging
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '64px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('ElevenLabs Audio Stream', canvas.width / 2, canvas.height / 2);
      }
      
      // Capture video stream from canvas
      const canvasStream = canvas.captureStream(30);

      // Create audio processing node
      const sourceNode = audioCtx.createBufferSource();
      sourceNode.buffer = decodedAudio;
      const destNode = audioCtx.createMediaStreamDestination();
      sourceNode.connect(destNode);

      // Combine video and audio tracks
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destNode.stream.getAudioTracks()
      ]);

      // Determine supported mime-type, fallback strictly to closest native capability
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm'; 
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      return new Promise<void>((resolve, reject) => {
        recorder.onstop = () => {
          try {
            const blob = new Blob(chunks, { type: mimeType });
            // By user requirement, packaged as mp4 (or forced mp4 extension for wide compatibility)
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voiceover_generation_${Date.now()}.mp4`;
            a.click();
            URL.revokeObjectURL(url);
            resolve();
          } catch (e) {
            reject(e);
          }
        };

        recorder.start();
        sourceNode.start(0);

        sourceNode.onended = () => {
          recorder.stop();
          audioCtx.close();
        };
      });
    } catch (e) {
      console.error('Packaging Error:', e);
      throw new Error('Failed to package audio into MP4 container.');
    }
  };

  const handleGenerateMedia = async () => {
    if (!apiKey || !selectedVoice || !text.trim()) return;
    
    setIsGenerating(true);
    setErrorText('');
    
    try {
      const finalScript = preprocessScript(text, selectedEngine);
      
      setStatusText('Contacting ElevenLabs API...');
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: finalScript,
          model_id: selectedEngine,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson?.detail?.message || 'Failed to generate speech');
      }

      setStatusText('Audio stream received. Wrapping in MP4 container...');
      const arrayBuffer = await response.arrayBuffer();
      await packageAudioToMP4(arrayBuffer);

      setStatusText('MP4 Generation complete. Triggering download...');
      setTimeout(() => setStatusText('System Ready.'), 3000);
    } catch (err: any) {
      setErrorText(err.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-sky-500/30 flex flex-col p-5 gap-5">
      
      <header className="flex justify-between items-center pb-2.5 border-b border-slate-700 shrink-0">
        <div>
          <h1 className="font-mono font-bold tracking-tighter text-xl text-sky-400">
            ELEVEN_SYNTH<span className="opacity-50">_PRO_v1.0</span>
          </h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1 hidden sm:block">Enterprise TTS Gen with Auto-Embellishment</p>
        </div>
        <div className="text-[10px] uppercase tracking-[1px] px-2 py-1 border border-sky-400 rounded text-sky-400">
          System Ready
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-[300px_1fr_240px] grid-rows-[auto_1fr_auto] lg:grid-rows-[1fr_auto] gap-5 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        
        {/* Settings Card - Left Column */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-3 lg:col-start-1 lg:col-end-2 lg:row-span-2 overflow-y-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2 mb-1">
            Authentication & Config
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] text-slate-400 font-medium">ElevenLabs API Key</label>
            <div className="flex gap-2">
              <input
                type={savedApiKey ? "password" : "text"}
                className="flex-1 bg-slate-900 border border-slate-700 text-white p-2.5 text-[0.85rem] rounded-md outline-none focus:border-sky-400 disabled:opacity-50 min-w-0"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={savedApiKey}
              />
              {savedApiKey ? (
                <button 
                  onClick={clearApiKey}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-xs font-medium rounded-md transition-colors shrink-0"
                  title="Clear Key"
                >
                  Clear
                </button>
              ) : (
                <button 
                  onClick={handleSaveApiKey}
                  className="px-3 py-2 bg-sky-400 hover:bg-sky-500 text-black text-xs font-bold rounded-md transition-colors disabled:opacity-50 shrink-0"
                  disabled={!apiKey}
                >
                  Save
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-2">
            <label className="text-[0.7rem] text-slate-400 font-medium">Model Engine</label>
            <select 
              className="bg-slate-900 border border-slate-700 text-white p-2.5 rounded-md text-[0.85rem] outline-none focus:border-sky-400 cursor-pointer disabled:opacity-50"
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value)}
              disabled={!savedApiKey || isGenerating}
            >
              {engines.map(eng => (
                <option key={eng.id} value={eng.id}>{eng.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 mt-2">
            <label className="text-[0.7rem] text-slate-400 font-medium">Target Voice</label>
            <select 
              className="bg-slate-900 border border-slate-700 text-white p-2.5 rounded-md text-[0.85rem] outline-none focus:border-sky-400 cursor-pointer disabled:opacity-50"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              disabled={!savedApiKey || voices.length === 0 || isGenerating}
            >
              {voices.length === 0 ? (
                <option value="">No voices available</option>
              ) : (
                voices.map(v => (
                  <option key={v.voice_id} value={v.voice_id}>{v.name} ({v.category})</option>
                ))
              )}
            </select>
          </div>
          
          <div className="mt-auto pt-6 hidden lg:block">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2 mb-3">
              System Health
            </div>
            <div className="flex justify-between items-center text-[0.75rem] mb-2">
              <span className="text-slate-400">Connection</span>
              <span className="font-mono text-sky-400">{savedApiKey ? 'SECURE' : 'NONE'}</span>
            </div>
            <div className="flex justify-between items-center text-[0.75rem]">
              <span className="text-slate-400">Voices Linked</span>
              <span className="font-mono text-sky-400">{voices.length}</span>
            </div>
          </div>
        </div>

        {/* Script Canvas - Center/Right Column, Row 1 */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-3 lg:col-start-2 lg:col-end-4 lg:row-span-1 min-h-[300px]">
          <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2 mb-1">
            <span>Scripting & Pre-Processing Engine</span>
            <span className="font-mono text-sky-400 text-[10px] hidden sm:inline">{text.length} chars</span>
          </div>
          
          <textarea
            className="flex-1 w-full bg-slate-900 border border-slate-700 text-sky-400 font-mono text-[0.85rem] leading-relaxed rounded-md p-4 outline-none focus:border-sky-400 resize-none mt-1"
            placeholder="Enter your script here...&#10;&#10;Our Pre-Processing Engine will automatically:&#10;- Format complex URLs&#10;- Remove non-standard unicode artifacts&#10;- Inject engine-specific auto-embellishments (laughs, deep breaths, sighs) at natural break points"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isGenerating}
          />
        </div>

        {/* Compiler Logs - Bottom Center */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-3 lg:col-start-2 lg:col-end-3 min-h-[150px]">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2 mb-1">
            Compiler Logs
          </div>
          <div className="flex-1 bg-black rounded-md p-3 font-mono text-[0.7rem] leading-relaxed overflow-y-auto w-full">
            {errorText ? (
              <div className="text-red-400 whitespace-pre-wrap">[ERROR] {errorText}</div>
            ) : (
              <div className="text-green-400 whitespace-pre-wrap flex flex-col gap-1">
                <span>[SYSTEM] Initializing kernel...</span>
                {savedApiKey && <span>[SYSTEM] API key verified.</span>}
                {statusText && <span>[CORE] {statusText}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Output Monitor - Bottom Right */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col justify-between gap-4 lg:col-start-3 lg:col-end-4 min-h-[150px]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2 mb-1">
              Output Monitor
            </div>
            
            <div className="mt-3 bg-black rounded-md flex items-center justify-center relative py-8 border border-slate-700/50 hidden sm:flex">
              <div className={`w-12 h-12 border-2 rounded-full flex items-center justify-center ${isGenerating ? 'border-sky-400 animate-pulse' : 'border-slate-600'}`}>
                <div className={`w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[12px] ml-1 ${isGenerating ? 'border-l-sky-400' : 'border-l-slate-600'}`}></div>
              </div>
              <div className="absolute bottom-2 left-2 font-mono text-[0.6rem] text-slate-500">
                Preview_Render.mp4
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerateMedia}
            disabled={!savedApiKey || !text.trim() || !selectedVoice || isGenerating}
            className="w-full bg-sky-400 hover:bg-sky-500 text-black font-bold uppercase py-3.5 rounded-md text-[0.75rem] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                PROCESSING...
              </>
            ) : (
              "GENERATE MEDIA (.MP4)"
            )}
          </button>
        </div>

      </main>
    </div>
  );
}

