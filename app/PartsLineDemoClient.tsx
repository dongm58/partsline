"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import { Room, RoomEvent, type AudioCaptureOptions } from "livekit-client";

type TokenResponse = {
  server_url: string;
  participant_token: string;
};

type TranscriptLine = {
  id: string;
  isFinal: boolean;
  text: string;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const AUDIO_CAPTURE_OPTIONS: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function uniqueName(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function unlockBrowserAudio() {
  const AudioContextClass =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  await audioContext.resume();
  await audioContext.close();
}

async function requestMicrophoneAccess() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  stream.getTracks().forEach((track) => track.stop());
}

export default function PartsLineDemoClient() {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState("Idle");
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const resetConnectionState = () => {
      setRoom(null);
      setStatus("Idle");
    };

    const handleParticipantDisconnected = () => {
      void room.disconnect();
      resetConnectionState();
    };

    room.on(RoomEvent.Disconnected, resetConnectionState);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    return () => {
      room.off(RoomEvent.Disconnected, resetConnectionState);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      void room.disconnect();
    };
  }, [room]);

  async function connect() {
    if (room) {
      return;
    }

    setStatus("Requesting microphone");
    await requestMicrophoneAccess();
    await unlockBrowserAudio();

    const room_name = uniqueName("partsline-demo");
    const participant_identity = uniqueName("browser");

    setStatus("Fetching token");
    const tokenResponse = await fetch("/api/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_name, participant_identity }),
    });

    if (!tokenResponse.ok) {
      throw new Error("token-request-failed");
    }

    const { server_url, participant_token } =
      (await tokenResponse.json()) as TokenResponse;

    const nextRoom = new Room({
      audioCaptureDefaults: AUDIO_CAPTURE_OPTIONS,
    });

    nextRoom.registerTextStreamHandler("lk.transcription", async (reader) => {
      const text = await reader.readAll();
      const attributes = reader.info.attributes ?? {};
      const isFinal = attributes["lk.transcription_final"] === "true";

      setTranscriptLines((current) => [
        ...current,
        {
          id: `${Date.now()}-${current.length}`,
          isFinal,
          text,
        },
      ]);
    });

    setStatus("Connecting");
    await nextRoom.connect(server_url, participant_token);
    await nextRoom.localParticipant.setMicrophoneEnabled(
      true,
      AUDIO_CAPTURE_OPTIONS,
    );

    setRoom(nextRoom);
    setStatus("Connected");
  }

  return (
    <main style={styles.shell}>
      <section style={styles.header}>
        <div>
          <p style={styles.kicker}>PartsLine</p>
          <h1 style={styles.title}>Counter voice demo</h1>
        </div>
        <div style={styles.status}>{status}</div>
      </section>

      <section style={styles.workspace}>
        <div style={styles.controls}>
          <button
            type="button"
            onClick={connect}
            disabled={status !== "Idle"}
            style={{
              ...styles.talkButton,
              ...(status !== "Idle" ? styles.talkButtonDisabled : {}),
            }}
          >Talk</button>
        </div>

        <section aria-live="polite" style={styles.transcript}>
          <h2 style={styles.transcriptTitle}>Transcript</h2>
          {transcriptLines.length === 0 ? (
            <p style={styles.emptyTranscript}>No transcript yet.</p>
          ) : (
            <ol style={styles.transcriptList}>
              {transcriptLines.map((line) => (
                <li key={line.id} style={styles.transcriptLine}>
                  <span style={styles.transcriptState}>
                    {line.isFinal ? "Final" : "Interim"}
                  </span>
                  <span>{line.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>

      {room ? (
        <RoomContext.Provider value={room}>
          <RoomAudioRenderer />
        </RoomContext.Provider>
      ) : null}
    </main>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    margin: 0,
    background: "#f5f7f9",
    color: "#16202a",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    padding: "28px 32px",
    borderBottom: "1px solid #d9e1e8",
    background: "#ffffff",
  },
  kicker: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 700,
    color: "#3f6f8f",
    letterSpacing: 0,
  },
  title: {
    margin: "4px 0 0",
    fontSize: "28px",
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  status: {
    minWidth: "128px",
    padding: "8px 12px",
    border: "1px solid #c9d5df",
    borderRadius: "6px",
    background: "#eef3f6",
    color: "#243442",
    fontSize: "14px",
    textAlign: "center" as const,
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "240px minmax(0, 1fr)",
    gap: "24px",
    padding: "24px 32px",
  },
  controls: {
    minHeight: "180px",
  },
  talkButton: {
    width: "100%",
    height: "56px",
    border: 0,
    borderRadius: "6px",
    background: "#126b58",
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  talkButtonDisabled: {
    opacity: 0.6,
    cursor: "default",
  },
  transcript: {
    minHeight: "420px",
    padding: "20px",
    border: "1px solid #d8e0e6",
    borderRadius: "6px",
    background: "#ffffff",
  },
  transcriptTitle: {
    margin: "0 0 16px",
    fontSize: "18px",
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  emptyTranscript: {
    margin: 0,
    color: "#65717c",
    fontSize: "15px",
  },
  transcriptList: {
    display: "grid",
    gap: "10px",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  transcriptLine: {
    display: "grid",
    gridTemplateColumns: "72px minmax(0, 1fr)",
    gap: "12px",
    padding: "12px",
    borderRadius: "6px",
    background: "#f7fafb",
    fontSize: "15px",
    lineHeight: 1.45,
  },
  transcriptState: {
    color: "#486577",
    fontWeight: 700,
  },
} satisfies Record<string, CSSProperties>;
