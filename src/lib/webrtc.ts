export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export type SignalMessage =
  | { type: "listener-join"; listenerId: string }
  | { type: "dj-ready" }
  | { type: "dj-stop" }
  | { type: "offer"; listenerId: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; listenerId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; listenerId: string; from: "dj" | "listener"; candidate: RTCIceCandidateInit };
