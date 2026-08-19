import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({ cors: { origin: ["http://localhost:5173", "http://127.0.0.1:5173"], credentials: true } })
export class SessionsGateway {
  @WebSocketServer() server!: Server;
  private watchers = new Map<string, string>();

  @SubscribeMessage("monitor:join") monitor(@ConnectedSocket() c: Socket, @MessageBody() b: { examId: string }) { c.join(`exam:${b.examId}`); }
  @SubscribeMessage("student:join") student(@ConnectedSocket() c: Socket, @MessageBody() b: { sessionId: string, examId?: string }) { c.join(`student:${b.sessionId}`); if (b.examId) c.join(`exam:${b.examId}`); if (this.watchers.has(b.sessionId)) this.server.to(`student:${b.sessionId}`).emit("webrtc:request"); }

  // SDP/ICE stays between the selected student and one watching teacher.
  @SubscribeMessage("webrtc:watch") watch(@ConnectedSocket() c: Socket, @MessageBody() b: { sessionId: string }) { this.watchers.set(b.sessionId, c.id); this.server.to(`student:${b.sessionId}`).emit("webrtc:request"); }
  @SubscribeMessage("webrtc:ready") ready(@MessageBody() b: { sessionId: string }) { const watcher = this.watchers.get(b.sessionId); if (watcher) this.server.to(watcher).emit("webrtc:ready", { sessionId: b.sessionId }); }
  @SubscribeMessage("webrtc:stop") stop(@ConnectedSocket() c: Socket, @MessageBody() b: { sessionId: string }) { if (this.watchers.get(b.sessionId) === c.id) this.watchers.delete(b.sessionId); this.server.to(`student:${b.sessionId}`).emit("webrtc:stop"); }
  @SubscribeMessage("webrtc:signal") signal(@ConnectedSocket() c: Socket, @MessageBody() b: { sessionId: string, signal: unknown }) {
    if (c.rooms.has(`student:${b.sessionId}`)) { const watcher = this.watchers.get(b.sessionId); if (watcher) this.server.to(watcher).emit("webrtc:signal", { sessionId: b.sessionId, signal: b.signal }); return; }
    c.to(`student:${b.sessionId}`).emit("webrtc:signal", b.signal);
  }
  handleDisconnect(c: Socket) { for (const [sessionId, watcher] of this.watchers) if (watcher === c.id) this.watchers.delete(sessionId); }
  emitMonitor(examId: string, event: string, payload: unknown) { this.server.to(`exam:${examId}`).emit(event, payload); }
  warn(sessionId: string, message: string) { this.server.to(`student:${sessionId}`).emit("student:warn", { message }); }
  lock(sessionId: string, locked: boolean) { this.server.to(`student:${sessionId}`).emit("student:lock", { locked }); }
}
