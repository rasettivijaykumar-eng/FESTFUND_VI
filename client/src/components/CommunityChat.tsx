import { ImagePlus, LoaderCircle, Mic, Send, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../context/AppState";

type CommunityAttachment = {
  kind: "image" | "video" | "audio";
  url: string;
  mime: string;
  originalName: string;
};

type CommunityMessage = {
  _id: string;
  festId: string;
  senderName: string;
  senderRole: "ADMIN" | "COMMITTEE" | "GUEST";
  text: string;
  attachment?: CommunityAttachment;
  createdAt: string;
};

type CommunityChatProps = {
  festId: string;
  access: "public" | "member";
};

const acceptedMedia = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mp4,audio/mpeg,audio/ogg,audio/webm,audio/wav";

export function CommunityChat({ festId, access }: CommunityChatProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  const messages = useQuery({
    queryKey: ["community-messages", festId, access],
    enabled: Boolean(festId),
    refetchInterval: 5000,
    queryFn: async () => {
      const path = access === "public"
        ? `/public/festivals/${encodeURIComponent(festId)}/community/messages`
        : "/community/messages";
      const response = await api.get(path, access === "member" ? { params: { festId } } : undefined);
      return response.data.data as CommunityMessage[];
    },
  });

  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [messages.data]);

  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText && !file) return;
    setSending(true);
    setError("");
    const body = new FormData();
    body.append("festId", festId);
    body.append("message", cleanText);
    if (file) body.append("media", file);
    if (access === "public" && displayName.trim()) body.append("displayName", displayName.trim());
    const path = access === "public"
      ? `/public/festivals/${encodeURIComponent(festId)}/community/messages`
      : "/community/messages";
    try {
      await api.post(path, body);
      setText("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["community-messages", festId, access] });
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  async function toggleRecording() {
    setError("");
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const activeRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      activeRecorder.onstop = () => {
        const mime = activeRecorder.mimeType || "audio/webm";
        const extension = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        setFile(new File(chunks, `voice-message-${Date.now()}.${extension}`, { type: mime }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.current = activeRecorder;
      activeRecorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied or unavailable.");
    }
  }

  async function removeMessage(messageId: string) {
    try {
      await api.delete(`/community/messages/${messageId}`);
      await queryClient.invalidateQueries({ queryKey: ["community-messages", festId, access] });
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  const isAdmin = access === "member" && user?.role === "ADMIN";

  return (
    <section className="glass overflow-hidden rounded-2xl border border-white/10" aria-label="Festival community chat">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Community chat</h2>
          <p className="text-xs text-[var(--muted)]">{festId} · Messages are visible to everyone in this festival room.</p>
        </div>
        {access === "public" && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-100">Guests are unverified</span>}
      </header>

      <div ref={thread} role="log" aria-live="polite" aria-label="Community messages" className="max-h-[min(58vh,560px)] min-h-64 space-y-3 overflow-y-auto px-4 py-4">
        {messages.isLoading && <p className="text-sm text-white/60">Loading festival messages…</p>}
        {messages.isError && <p className="text-sm text-red-200">Could not load messages. They will retry automatically.</p>}
        {messages.data?.length === 0 && <p className="py-10 text-center text-sm text-white/60">No messages yet. Start the conversation with the festival community.</p>}
        {messages.data?.map((message) => (
          <article key={message._id} className="max-w-3xl rounded-xl bg-white/[0.045] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-amber-100">{message.senderName}</span>
                <span className="text-[10px] uppercase tracking-wide text-white/45">{message.senderRole === "GUEST" ? "Unverified guest" : message.senderRole.toLowerCase()}</span>
                <time className="text-[10px] text-white/40" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
              </div>
              {isAdmin && <button type="button" onClick={() => void removeMessage(message._id)} className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Remove message"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {message.text && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/85">{message.text}</p>}
            {message.attachment?.kind === "image" && <img src={message.attachment.url} alt={message.attachment.originalName || "Community image"} loading="lazy" className="mt-2 max-h-80 max-w-full rounded-lg object-contain" />}
            {message.attachment?.kind === "video" && <video src={message.attachment.url} controls preload="metadata" className="mt-2 max-h-80 max-w-full rounded-lg" />}
            {message.attachment?.kind === "audio" && <audio src={message.attachment.url} controls preload="metadata" className="mt-2 w-full max-w-md" />}
          </article>
        ))}
      </div>

      <form onSubmit={(event) => void sendMessage(event)} className="border-t border-white/10 bg-black/10 p-3">
        {access === "public" && <label className="mb-2 block max-w-xs text-xs text-white/60">Display name (unverified)<input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 60))} placeholder="Guest" maxLength={60} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40" /></label>}
        {file && <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs"><span className="truncate">{file.name}</span><button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }} aria-label="Remove attachment"><X className="h-4 w-4" /></button></div>}
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 2000))} maxLength={2000} rows={2} placeholder="Write to this festival community…" aria-label="Community message" className="min-h-11 flex-1 resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-orange-400 focus:outline-none" />
          <input ref={fileInput} type="file" accept={acceptedMedia} className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} aria-label="Attach photo, video, or audio" />
          <button type="button" title="Attach photo or video" aria-label="Attach photo or video" onClick={() => fileInput.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/75 hover:bg-white/10"><ImagePlus className="h-5 w-5" /></button>
          <button type="button" title={recording ? "Stop voice recording" : "Record a voice message"} aria-label={recording ? "Stop voice recording" : "Record a voice message"} onClick={() => void toggleRecording()} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${recording ? "bg-red-600 text-white" : "bg-white/5 text-white/75 hover:bg-white/10"}`}>{recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}</button>
          <button type="submit" disabled={sending || (!text.trim() && !file)} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40">{sending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-200">{error}</p>}
        <p className="mt-2 text-[10px] text-white/40">Images: 20 MB · Audio: 15 MB · Video: 100 MB. Be respectful; admins can remove messages.</p>
      </form>
    </section>
  );
}