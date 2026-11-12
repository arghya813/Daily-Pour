"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
  message?: string;
};

type SpeechRecognitionController = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionController;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow the mic for this site, then try again.";
    case "no-speech":
      return "I didn’t hear anything. Tap the mic and try again.";
    case "audio-capture":
      return "No microphone was found on this device.";
    case "network":
      return "Voice input needs an internet connection. Check your network and try again.";
    case "language-not-supported":
      return "Voice input doesn’t support this language yet.";
    default:
      return "Voice input stopped unexpectedly. Please try again.";
  }
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability check after mount */
    const Constructor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Constructor) {
      setSupported(false);
      return;
    }

    const recognition = new Constructor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";

        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      setInterim(interimText.trim());

      if (finalText.trim()) {
        setInterim("");
        onTranscriptRef.current(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      setError(speechErrorMessage(event.error));
      setListening(false);
      setInterim("");
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    setSupported(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }

    const recognition = recognitionRef.current;
    if (!recognition) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    setError(null);
    setInterim("");

    try {
      recognition.start();
    } catch {
      // The browser can throw if recognition is already starting.
    }
  }, [listening, stop]);

  return {
    supported,
    listening,
    interim,
    error,
    toggle,
    stop,
  };
}
