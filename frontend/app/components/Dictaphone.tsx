"use client";

import { useState, useRef } from "react";
import { useAuth } from "./AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function Dictaphone() {
  const { token } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [volume, setVolume] = useState(0); 

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const saveTask = async (textToSave: string) => {
    setStatusMessage("Saving to database...");
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          task: textToSave,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setStatusMessage("✅ Task saved successfully!");
        setTimeout(() => setStatusMessage(""), 3000);
      } else {
        setStatusMessage("❌ Failed to save task.");
      }
    } catch (error) {
      setStatusMessage("❌ Error connecting to server.");
    }
  };

  const uploadAudioForTranscription = async (audioBlob: Blob) => {
    setStatusMessage("🧠 Processing AI Transcription...");
    
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    try {
      const response = await fetch(`${API_URL}/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setTranscript(data.transcript);
        
        await saveTask(data.transcript);
      } else {
        setStatusMessage("❌ AI Transcription failed.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setStatusMessage("❌ Server unreachable.");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setVolume(sum / dataArray.length); 
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        uploadAudioForTranscription(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatusMessage("");
      setTranscript("");

    } catch (err) {
      console.error("Mic access denied:", err);
      setStatusMessage("❌ Mic access denied by system.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    
    setVolume(0);
    setIsRecording(false);
  };

  const pulseScale = isRecording ? 1 + (volume / 200) * 0.6 : 1;

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-8 w-full">
      <div className="relative flex items-center justify-center w-32 h-32">
        {isRecording && (
          <div
            className="absolute bg-red-500 rounded-full opacity-40 transition-transform duration-75"
            style={{ width: "100%", height: "100%", transform: `scale(${pulseScale})` }}
          ></div>
        )}

        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`relative w-full h-full rounded-full flex items-center justify-center text-4xl shadow-lg transition-colors duration-300 z-10 ${
            isRecording ? "bg-red-500 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          🎤
        </button>
      </div>

      <div className="w-full max-w-md min-h-[100px] p-4 bg-gray-800 rounded-xl border border-gray-700 shadow-inner relative flex flex-col justify-center">
        <p className="text-gray-300 text-center text-lg">
          {transcript || (isRecording ? "Listening to your voice..." : "Tap to Speak")}
        </p>

        {statusMessage && (
          <p className={`absolute -bottom-8 left-0 right-0 text-center text-sm font-medium ${
            statusMessage.includes("❌") ? "text-red-400" : "text-green-400"
          }`}>
            {statusMessage}
          </p>
        )}
      </div>
    </div>
  );
}
