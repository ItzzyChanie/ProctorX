import { io } from 'socket.io-client';

const defaultSocketUrl = `${window.location.protocol}//${window.location.hostname}:4000`;
const socketUrl = import.meta.env.VITE_SOCKET_URL ?? defaultSocketUrl;

export const socket = io(socketUrl, {
  autoConnect: false,
  withCredentials: true,
});

export const notificationSocket = io(socketUrl, {
  autoConnect: false,
  withCredentials: true,
  forceNew: true,
});