"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  type DocumentReference,
} from "firebase/firestore";
import {
  signInAnonymously,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirebase, CONNECTIONS_COLLECTION } from "@/lib/firebase";

export type ChatStatus = "idle" | "searching" | "connected" | "peer-left";
export type ChatRole = "caller" | "callee" | null;

export interface ChatMessage {
  id: string;
  from: "me" | "stranger";
  text: string;
  ts: number;
}

interface RoomInfo {
  Ref: DocumentReference | null;
  Id: string | null;
}

interface ActiveRoom {
  roomId: string | null;
  ownerUid: string | null;
  joinedUid: string | null;
}

const ICE_SERVERS = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
  ],
  iceCandidatePoolSize: 10,
} as RTCConfiguration;

let msgSeq = 0;
function makeId() {
  msgSeq += 1;
  return `${Date.now()}-${msgSeq}`;
}

/**
 * Random peer-to-peer video chat over WebRTC, using Firestore as a minimal
 * signaling/matchmaking layer. Mirrors the original app.js flow but:
 *  - disconnects the peer connection FIRST, then cleans Firestore in the
 *    background (non-blocking);
 *  - tracks and tears down onSnapshot listeners (no leaks across "next");
 *  - wires up a real RTCDataChannel for text messaging.
 */
export function useRandomChat() {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channelOpen, setChannelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ChatRole>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const userRef = useRef<User | null>(null);
  const authReadyRef = useRef(false);

  const roomInfoRef = useRef<RoomInfo>({ Ref: null, Id: null });
  const activeRoomRef = useRef<ActiveRoom>({
    roomId: null,
    ownerUid: null,
    joinedUid: null,
  });

  const unsubsRef = useRef<Array<() => void>>([]);

  // Guards against the peer's own close/cancel events firing while we hang up.
  const intentionalCloseRef = useRef(false);
  const peerLeftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectedRef = useRef(false);

  const dismissError = useCallback(() => setError(null), []);

  const clearPeerLeftTimer = useCallback(() => {
    if (peerLeftTimerRef.current) {
      clearTimeout(peerLeftTimerRef.current);
      peerLeftTimerRef.current = null;
    }
  }, []);

  /* ------------------------------ Messaging ------------------------------- */
  const pushMessage = useCallback(
    (from: "me" | "stranger", text: string) => {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), from, text, ts: Date.now() },
      ]);
    },
    []
  );

  /* ------------------------- Firestore cleanup ---------------------------- */
  const deleteCollectionDocs = useCallback(async (name: string) => {
    const { db } = getFirebase();
    if (!db) return;
    const snapshot = await getDocs(collection(db, name));
    await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
  }, []);

  const cleanupRemoteRoomData = useCallback(
    async (captured: { info: RoomInfo; room: ActiveRoom }) => {
      const { db } = getFirebase();
      const user = userRef.current;
      if (!db || !user || !captured.info.Ref) return;

      const canCleanup =
        user.uid === captured.room.ownerUid ||
        user.uid === captured.room.joinedUid;
      if (!canCleanup) return;

      const roomId = captured.room.roomId || captured.info.Id;
      if (roomId) {
        try {
          await deleteCollectionDocs(roomId + "caller");
          await deleteCollectionDocs(roomId + "callee");
        } catch (e) {
          console.warn("ICE collection cleanup failed:", (e as Error)?.message);
        }
      }
      try {
        await deleteDoc(captured.info.Ref);
      } catch (e) {
        console.warn("room doc cleanup failed:", (e as Error)?.message);
      }
    },
    [deleteCollectionDocs]
  );

  /* --------------------------- Peer-left handling ------------------------- */
  const handlePeerLeft = useCallback(() => {
    clearPeerLeftTimer();
    if (intentionalCloseRef.current) return;
    connectedRef.current = false;
    setChannelOpen(false);
    setRemoteStream(null);

    // Tear down the peer immediately; Firestore cleanup runs in background.
    const pc = peerRef.current;
    peerRef.current = null;
    if (pc) {
      try {
        pc.ontrack = null;
        pc.ondatachannel = null;
        pc.close();
      } catch {
        /* noop */
      }
    }
    if (channelRef.current) {
      try {
        channelRef.current.close();
      } catch {
        /* noop */
      }
      channelRef.current = null;
    }

    unsubsRef.current.forEach((u) => {
      try {
        u();
      } catch {
        /* noop */
      }
    });
    unsubsRef.current = [];

    const captured = {
      info: { ...roomInfoRef.current },
      room: { ...activeRoomRef.current },
    };
    roomInfoRef.current = { Ref: null, Id: null };
    activeRoomRef.current = { roomId: null, ownerUid: null, joinedUid: null };

    cleanupRemoteRoomData(captured).catch((e) =>
      console.warn("background cleanup failed:", (e as Error)?.message)
    );

    setStatus("peer-left");
  }, [clearPeerLeftTimer, cleanupRemoteRoomData]);

  /* ------------------------------ Data channel ---------------------------- */
  const wireDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      channelRef.current = channel;
      channel.onopen = () => setChannelOpen(true);
      channel.onclose = () => {
        setChannelOpen(false);
        if (!intentionalCloseRef.current) handlePeerLeft();
      };
      channel.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { text?: string };
          if (payload && typeof payload.text === "string") {
            pushMessage("stranger", payload.text);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
    },
    [handlePeerLeft, pushMessage]
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const channel = channelRef.current;
      if (!channel || channel.readyState !== "open") return false;
      try {
        channel.send(JSON.stringify({ text: trimmed, ts: Date.now() }));
        pushMessage("me", trimmed);
        return true;
      } catch {
        return false;
      }
    },
    [pushMessage]
  );

  /* ----------------------------- Firebase auth ---------------------------- */
  const ensureAnonymousAuth = useCallback(async () => {
    if (authReadyRef.current && userRef.current) return userRef.current;
    const { auth } = getFirebase();
    if (!auth) throw new Error("Firebase not available on the server.");
    await signInAnonymously(auth);
    const user = await new Promise<User>((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (u) => {
          if (u) {
            userRef.current = u;
            authReadyRef.current = true;
            unsubscribe();
            resolve(u);
          }
        },
        (err) => {
          unsubscribe();
          reject(err);
        }
      );
    });
    return user;
  }, []);

  /* ------------------------------- Camera --------------------------------- */
  const ensureCamera = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  /* ----------------------- Firestore signaling ---------------------------- */
  const trackActiveRoom = useCallback(
    (
      info: RoomInfo,
      roomId: string | null,
      ownerUid: string | null,
      joinedUid: string | null
    ) => {
      roomInfoRef.current = { Ref: info.Ref, Id: info.Id };
      activeRoomRef.current = { roomId, ownerUid, joinedUid };
    },
    []
  );

  const sendCandidateToRemotePeer = useCallback(
    (
      roomId: string,
      peerConnection: RTCPeerConnection,
      role: "caller" | "callee",
      roomOwnerUid: string | null
    ) => {
      const { db } = getFirebase();
      if (!db || !userRef.current) return;
      const ownerUid = userRef.current.uid;
      const handler = (event: RTCPeerConnectionEventMap["icecandidate"]) => {
        if (event.candidate) {
          const json = event.candidate.toJSON();
          addDoc(collection(db, roomId + role), {
            ...json,
            ownerUid,
            usernameFragment: json.usernameFragment || null,
            roomOwnerUid: roomOwnerUid || null,
          }).catch((err) =>
            console.warn("ICE send failed:", (err as Error)?.message)
          );
        }
      };
      peerConnection.addEventListener("icecandidate", handler);
    },
    []
  );

  const listenToRemoteCandidate = useCallback(
    (
      roomId: string,
      peerConnection: RTCPeerConnection,
      role: "caller" | "callee"
    ) => {
      const { db } = getFirebase();
      if (!db) return;
      const remoteRole = role === "caller" ? "callee" : "caller";
      const unsub = onSnapshot(
        collection(db, roomId + remoteRole),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const candidate = new RTCIceCandidate(
                change.doc.data() as RTCIceCandidateInit
              );
              peerConnection
                .addIceCandidate(candidate)
                .catch((err) =>
                  console.warn(
                    "addIceCandidate failed:",
                    (err as Error)?.message
                  )
                );
            }
          });
        },
        (err) =>
          console.warn("remote ICE listen failed:", (err as Error)?.message)
      );
      unsubsRef.current.push(unsub);
    },
    []
  );

  const waitForAnswer = useCallback(
    (info: RoomInfo, peerConnection: RTCPeerConnection) => {
      const { db } = getFirebase();
      if (!db || !info.Ref) return;
      const unsub = onSnapshot(
        info.Ref,
        (snapshot) => {
          const data = snapshot.data();
          if (
            data &&
            !peerConnection.currentRemoteDescription &&
            data.answer
          ) {
            const answer = new RTCSessionDescription(
              data.answer as RTCSessionDescriptionInit
            );
            peerConnection
              .setRemoteDescription(answer)
              .catch((err) =>
                console.warn(
                  "setRemoteDescription failed:",
                  (err as Error)?.message
                )
              );
          }
        },
        (err) => console.warn("answer listen failed:", (err as Error)?.message)
      );
      unsubsRef.current.push(unsub);
    },
    []
  );

  const sendOffer = useCallback(
    async (info: RoomInfo, peerConnection: RTCPeerConnection) => {
      const { db } = getFirebase();
      const user = userRef.current;
      if (!db || !user) throw new Error("Not authenticated");

      // Caller owns the data channel — must be created before the offer so it
      // is negotiated into the SDP.
      const channel = peerConnection.createDataChannel("comm");
      wireDataChannel(channel);

      setRole("caller");
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const generateId = Math.random().toString(36).slice(2, 8);
      sendCandidateToRemotePeer(generateId, peerConnection, "caller", user.uid);

      const roomWithOffer = {
        offer: { type: offer.type, sdp: offer.sdp },
        id: generateId,
        available: true,
        joinedUid: null,
        ownerUid: user.uid,
      };
      info.Ref = await addDoc(
        collection(db, CONNECTIONS_COLLECTION),
        roomWithOffer
      );
      info.Id = info.Ref.id;
      trackActiveRoom(info, generateId, user.uid, null);

      waitForAnswer(info, peerConnection);
      listenToRemoteCandidate(generateId, peerConnection, "caller");
    },
    [
      wireDataChannel,
      sendCandidateToRemotePeer,
      trackActiveRoom,
      waitForAnswer,
      listenToRemoteCandidate,
    ]
  );

  const joinCall = useCallback(
    async (info: RoomInfo, peerConnection: RTCPeerConnection) => {
      const { db } = getFirebase();
      const user = userRef.current;
      if (!db || !user) throw new Error("Not authenticated");

      const querySnapshot = await getDocs(
        collection(db, CONNECTIONS_COLLECTION)
      );
      let roomDoc: (typeof querySnapshot.docs)[number]["data"] | null = null;
      let roomRef: DocumentReference | null = null;

      for (const d of querySnapshot.docs) {
        const data = d.data();
        if (data?.available === true) {
          roomDoc = data;
          roomRef = d.ref;
          break;
        }
      }

      if (!roomRef || !roomDoc) {
        await sendOffer(info, peerConnection);
        return;
      }

      // Callee — receives the caller's data channel.
      setRole("callee");
      info.Ref = roomRef;
      info.Id = roomRef.id;

      const offer = roomDoc.offer;
      await peerConnection.setRemoteDescription(
        offer as RTCSessionDescriptionInit
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      const generateId = roomDoc.id as string;
      const ownerUid = (roomDoc.ownerUid as string) || null;
      sendCandidateToRemotePeer(generateId, peerConnection, "callee", ownerUid);
      listenToRemoteCandidate(generateId, peerConnection, "callee");

      await updateDoc(roomRef, {
        answer: { type: answer.type, sdp: answer.sdp },
        available: false,
        joinedUid: user.uid,
        ownerUid: ownerUid ?? null,
      });
      trackActiveRoom(info, generateId, ownerUid, user.uid);
    },
    [sendOffer, sendCandidateToRemotePeer, listenToRemoteCandidate, trackActiveRoom]
  );

  /* ------------------------------ Peer factory ---------------------------- */
  const createPeer = useCallback(async () => {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);

    peerConnection.addEventListener("track", (event) => {
      const [stream] = event.streams;
      if (stream) setRemoteStream(stream);
      if (!connectedRef.current) {
        connectedRef.current = true;
        setStatus("connected");
      }
    });

    // Callee receives the caller's data channel here.
    peerConnection.addEventListener("datachannel", (event) => {
      wireDataChannel(event.channel);
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      const state = peerConnection.connectionState;
      if (state === "connected") {
        clearPeerLeftTimer();
        if (!connectedRef.current) {
          connectedRef.current = true;
          setStatus("connected");
        }
      } else if (state === "failed" || state === "closed") {
        if (!intentionalCloseRef.current) handlePeerLeft();
      }
    });

    peerConnection.addEventListener("iceconnectionstatechange", () => {
      const state = peerConnection.iceConnectionState;
      if (state === "disconnected") {
        clearPeerLeftTimer();
        peerLeftTimerRef.current = setTimeout(() => {
          if (!intentionalCloseRef.current) handlePeerLeft();
        }, 5000);
      } else if (state === "connected" || state === "completed") {
        clearPeerLeftTimer();
      }
    });

    // Attach local tracks if the camera is already running.
    const local = localStreamRef.current;
    if (local) {
      local.getTracks().forEach((track) => {
        try {
          peerConnection.addTrack(track, local);
        } catch {
          /* track may already be attached */
        }
      });
    }

    return peerConnection;
  }, [wireDataChannel, clearPeerLeftTimer, handlePeerLeft]);

  /* ------------------------------- Hang up -------------------------------- */
  /**
   * Disconnects the peer connection FIRST (immediate, local), then finishes
   * Firestore cleanup in the background so the UI never blocks on the network.
   */
  const hangUp = useCallback(
    (opts: { keepCamera?: boolean } = {}) => {
      intentionalCloseRef.current = true;
      clearPeerLeftTimer();
      connectedRef.current = false;
      setChannelOpen(false);
      setRemoteStream(null);

      // 1. Immediately tear down the peer connection.
      const pc = peerRef.current;
      peerRef.current = null;
      if (pc) {
        try {
          pc.ontrack = null;
          pc.ondatachannel = null;
          pc.close();
        } catch {
          /* noop */
        }
      }
      if (channelRef.current) {
        try {
          channelRef.current.close();
        } catch {
          /* noop */
        }
        channelRef.current = null;
      }

      // 2. Stop listening to Firestore (synchronous).
      unsubsRef.current.forEach((u) => {
        try {
          u();
        } catch {
          /* noop */
        }
      });
      unsubsRef.current = [];

      // Capture room state for background cleanup, then clear refs.
      const captured = {
        info: { ...roomInfoRef.current },
        room: { ...activeRoomRef.current },
      };
      roomInfoRef.current = { Ref: null, Id: null };
      activeRoomRef.current = { roomId: null, ownerUid: null, joinedUid: null };
      setRole(null);

      // 3. Camera handling.
      if (!opts.keepCamera) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
        }
        setLocalStream(null);
      }

      // 4. Background Firestore cleanup (fire and forget).
      cleanupRemoteRoomData(captured).catch((e) =>
        console.warn("background cleanup failed:", (e as Error)?.message)
      );

      // Reset the manual-close guard shortly after, so a fresh start is clean.
      setTimeout(() => {
        intentionalCloseRef.current = false;
      }, 300);
    },
    [clearPeerLeftTimer, cleanupRemoteRoomData]
  );

  /* -------------------------------- Start --------------------------------- */
  const start = useCallback(async () => {
    setError(null);
    setMessages([]);
    setStatus("searching");
    connectedRef.current = false;
    intentionalCloseRef.current = false;

    try {
      await ensureAnonymousAuth();
      await ensureCamera();

      const peerConnection = await createPeer();
      peerRef.current = peerConnection;

      const info: RoomInfo = { Ref: null, Id: null };
      await joinCall(info, peerConnection);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.warn("start failed:", err?.code || err?.message || err);
      hangUp({ keepCamera: false });
      setStatus("idle");
      // Generic, friendly message — no internals leaked to the user.
      setError("Sorry, something bad just happened. Try again after a moment.");
    }
  }, [ensureAnonymousAuth, ensureCamera, createPeer, joinCall, hangUp]);

  const nextPerson = useCallback(async () => {
    // Drop the current peer (keep the camera), then search again.
    hangUp({ keepCamera: true });
    await start();
  }, [hangUp, start]);

  const disconnect = useCallback(() => {
    hangUp({ keepCamera: false });
    setStatus("idle");
  }, [hangUp]);

  /* ------------------------------ Tear down on unmount -------------------- */
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      clearPeerLeftTimer();
      const pc = peerRef.current;
      if (pc) {
        try {
          pc.close();
        } catch {
          /* noop */
        }
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      unsubsRef.current.forEach((u) => {
        try {
          u();
        } catch {
          /* noop */
        }
      });
    };
  }, [clearPeerLeftTimer]);

  return {
    status,
    role,
    localStream,
    remoteStream,
    messages,
    channelOpen,
    error,
    dismissError,
    start,
    disconnect,
    nextPerson,
    sendMessage,
  };
}
