"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  MessageCircle,
  PhoneOff,
  Play,
  Send,
  Shuffle,
  Signal,
  UserX,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useRandomChat,
  type ChatStatus,
} from "@/hooks/use-random-chat";

export default function Home() {
  const chat = useRandomChat();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = chat.localStream;
    }
  }, [chat.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = chat.remoteStream;
    }
  }, [chat.remoteStream]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  const started = chat.status !== "idle";
  const canChat = chat.channelOpen && chat.status === "connected";

  const onSend = () => {
    if (chat.sendMessage(draft)) setDraft("");
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Ambient background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 85% -5%, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0) 60%), radial-gradient(50% 50% at 0% 100%, rgba(244,63,94,0.10) 0%, rgba(244,63,94,0) 55%)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Video className="size-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">
              Roulette
            </h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              Random video chat
            </p>
          </div>
        </div>
        <StatusPill status={chat.status} channelOpen={chat.channelOpen} />
      </header>

      {/* Stage */}
      <main className="relative z-10 min-h-0 flex-1 px-3 pb-3 sm:px-6">
        <div className="grid h-full min-h-0 grid-rows-[40vh_1fr] gap-3 lg:grid-cols-[1fr_22rem] lg:grid-rows-1 xl:grid-cols-[1fr_26rem]">
          {/* Remote stage */}
          <section className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-2xl shadow-black/40 backdrop-blur">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
            <RemoteOverlay status={chat.status} hasRemote={!!chat.remoteStream} />

            {/* Local PiP */}
            <div className="absolute bottom-3 left-3 z-20 h-24 w-32 overflow-hidden rounded-xl border border-white/15 bg-zinc-950/80 shadow-lg sm:h-32 sm:w-44">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              {!chat.localStream && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                  <VideoOff className="size-5" />
                </div>
              )}
              <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200 backdrop-blur">
                You
              </span>
            </div>
          </section>

          {/* Chat panel */}
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-xl shadow-black/30 backdrop-blur">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <MessageCircle className="size-4 text-emerald-400" />
                Chat
              </div>
              <span
                className={`flex items-center gap-1.5 text-xs ${canChat ? "text-emerald-400" : "text-zinc-500"}`}
              >
                <span
                  className={`size-1.5 rounded-full ${canChat ? "bg-emerald-400" : "bg-zinc-600"}`}
                />
                {canChat ? "Live" : "Offline"}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
              {chat.messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <MessageCircle className="mb-2 size-7 text-zinc-700" />
                  <p className="text-sm text-zinc-500">
                    {chat.status === "connected"
                      ? "Say hi to your match 👋"
                      : "Messages appear here once you’re connected."}
                  </p>
                </div>
              ) : (
                chat.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] break-words rounded-2xl px-3 py-1.5 text-sm leading-snug shadow-sm ${
                        m.from === "me"
                          ? "rounded-br-sm bg-emerald-500/20 text-emerald-50 ring-1 ring-emerald-500/30"
                          : "rounded-bl-sm bg-zinc-800/90 text-zinc-100 ring-1 ring-white/10"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input row — input flexes, send button never overflows */}
            <div className="flex shrink-0 items-center gap-2 border-t border-white/10 p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  canChat ? "Type a message…" : "Connect to start chatting"
                }
                disabled={!canChat}
                className="min-w-0 flex-1 border-white/10 bg-zinc-950/60 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
              />
              <Button
                onClick={onSend}
                disabled={!canChat || !draft.trim()}
                size="icon"
                className="size-10 shrink-0 rounded-xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                aria-label="Send message"
              >
                <Send className="size-4" />
              </Button>
            </div>
          </aside>
        </div>
      </main>

      {/* Controls (sticky bottom) */}
      <footer className="relative z-10 shrink-0 border-t border-white/10 bg-zinc-950/60 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-3">
          {!started ? (
            <Button
              onClick={chat.start}
              size="lg"
              className="h-12 gap-2 rounded-xl bg-emerald-500 px-8 text-base font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 hover:shadow-emerald-500/30"
            >
              <Play className="size-5 fill-current" />
              Start
            </Button>
          ) : (
            <>
              <Button
                onClick={chat.nextPerson}
                size="lg"
                className="h-12 gap-2 rounded-xl bg-zinc-100 px-6 text-base font-semibold text-zinc-950 shadow-lg transition hover:bg-white"
              >
                <Shuffle className="size-5" />
                Next Person
              </Button>
              <Button
                onClick={chat.disconnect}
                size="lg"
                className="h-12 gap-2 rounded-xl bg-rose-500/90 px-6 text-base font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-500"
              >
                <PhoneOff className="size-5" />
                Disconnect
              </Button>
            </>
          )}
        </div>
      </footer>

      {/* Error modal */}
      <Dialog
        open={!!chat.error}
        onOpenChange={(o) => {
          if (!o) chat.dismissError();
        }}
      >
        <DialogContent className="border-white/10 bg-zinc-900 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <Signal className="size-4 text-rose-400" />
              Something went wrong
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {chat.error}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={chat.dismissError}
              className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({
  status,
  channelOpen,
}: {
  status: ChatStatus;
  channelOpen: boolean;
}) {
  const config: Record<
    ChatStatus,
    { label: string; dot: string; text: string; pulse: boolean }
  > = {
    idle: {
      label: "Idle",
      dot: "bg-zinc-500",
      text: "text-zinc-400",
      pulse: false,
    },
    searching: {
      label: "Searching",
      dot: "bg-amber-400",
      text: "text-amber-300",
      pulse: true,
    },
    connected: {
      label: channelOpen ? "Connected" : "Connecting",
      dot: "bg-emerald-400",
      text: "text-emerald-300",
      pulse: !channelOpen,
    },
    "peer-left": {
      label: "Stranger left",
      dot: "bg-rose-400",
      text: "text-rose-300",
      pulse: false,
    },
  };
  const c = config[status];
  return (
    <div
      className={`flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium ${c.text}`}
    >
      <span className="relative flex size-2">
        {c.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${c.dot}`}
          />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${c.dot}`} />
      </span>
      {c.label}
    </div>
  );
}

function RemoteOverlay({
  status,
  hasRemote,
}: {
  status: ChatStatus;
  hasRemote: boolean;
}) {
  // When connected with a live stream, no overlay.
  if (status === "connected" && hasRemote) return null;

  let content: React.ReactNode = null;

  if (status === "searching") {
    content = (
      <>
        <Loader2 className="mb-4 size-10 animate-spin text-emerald-400" />
        <p className="text-lg font-semibold text-zinc-100">
          Looking for someone to chat with…
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Hang tight, we’re finding you a match.
        </p>
      </>
    );
  } else if (status === "peer-left") {
    content = (
      <>
        <UserX className="mb-4 size-12 text-rose-400" />
        <p className="text-lg font-semibold text-zinc-100">
          Stranger disconnected
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Hit <span className="font-medium text-zinc-300">Next Person</span> to
          meet someone new.
        </p>
      </>
    );
  } else if (status === "connected" && !hasRemote) {
    content = (
      <>
        <Loader2 className="mb-4 size-8 animate-spin text-emerald-400" />
        <p className="text-sm text-zinc-400">Establishing connection…</p>
      </>
    );
  } else {
    // idle
    content = (
      <>
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-500 ring-1 ring-white/10">
          <VideoOff className="size-8" />
        </div>
        <p className="text-lg font-semibold text-zinc-100">
          Ready to connect
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Press <span className="font-medium text-emerald-400">Start</span> to
          meet someone new.
        </p>
      </>
    );
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/40 px-6 text-center backdrop-blur-[2px]">
      {content}
    </div>
  );
}
