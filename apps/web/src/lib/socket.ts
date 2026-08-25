import { io } from 'socket.io-client';

export const socket = io(
  import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000',
  {
    autoConnect: false,
    withCredentials: true,
  }
);

export const notificationSocket = io(
  import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000',
  {
    autoConnect: false,
    withCredentials: true,
    forceNew: true,
  }
);
