"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocketClient(): Socket {
  if (socket) {
    return socket;
  }

  const url = process.env.NEXT_PUBLIC_SOCKET_URL?.trim() || undefined;
  socket = io(url, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 500,
  });

  return socket;
}
