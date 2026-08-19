import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export type ReducedFuzzyIndicators = { tab_switch_count: number; blacklisted_app_seconds: number; idle_seconds: number; usb_event_count: number };
export type FullFuzzyIndicators = ReducedFuzzyIndicators & { face_not_visible?: number; excessive_eye_movement?: number; possible_talking?: number; multiple_faces?: number; voice_detected?: number };

@Injectable()
export class AiService {
  constructor(private config: ConfigService) {}
  async scoreReduced(sessionId: string, studentId: string, indicators: ReducedFuzzyIndicators) {
    return this.score(sessionId, studentId, indicators, "reduced");
  }
  async scoreFull(sessionId: string, studentId: string, indicators: FullFuzzyIndicators) {
    return this.score(sessionId, studentId, indicators, "full");
  }
  private async score(sessionId: string, studentId: string, indicators: ReducedFuzzyIndicators | FullFuzzyIndicators, ruleSet: "reduced" | "full") {
    try {
      const { data } = await axios.post(`${this.config.get("AI_SERVICE_URL") ?? "http://127.0.0.1:8000"}/v1/fuzzy/score`, { session_id: sessionId, student_id: studentId, indicators, rule_set: ruleSet }, { headers: { "X-Internal-Api-Key": this.config.get("INTERNAL_API_KEY") ?? "development-internal-key" }, timeout: 5000 });
      return data;
    } catch (error) {
      throw new ServiceUnavailableException("AI scoring service is unavailable.");
    }
  }
  async analyze(kind: "face" | "audio", sessionId: string, buffer: Buffer, filename: string) {
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer; const form = new FormData(); if (kind === "face") form.append("session_id", sessionId); form.append(kind === "face" ? "frame" : "chunk", new Blob([bytes]), filename);
    try { const { data } = await axios.post(`${this.config.get("AI_SERVICE_URL") ?? "http://127.0.0.1:8000"}/v1/analysis/${kind}`, form, { headers: { "X-Internal-Api-Key": this.config.get("INTERNAL_API_KEY") ?? "development-internal-key" }, timeout: 8000 }); return data; }
    catch { throw new ServiceUnavailableException("AI analysis service is unavailable."); }
  }
}
