import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { calculateCorrelation, CorrelationPair } from './correlation';

export type ReducedFuzzyIndicators = {
  tab_switch_count: number;
  blacklisted_app_seconds: number;
  idle_seconds: number;
  usb_event_count: number;
};
export type FullFuzzyIndicators = ReducedFuzzyIndicators & {
  face_not_visible?: number;
  excessive_eye_movement?: number;
  possible_talking?: number;
  multiple_faces?: number;
  voice_detected?: number;
};
export type QuestionCounts = Record<
  'MULTIPLE_CHOICE' | 'ENUMERATION' | 'IDENTIFICATION' | 'ESSAY',
  number
>;

@Injectable()
export class AiService {
  constructor(private config: ConfigService) {}
  private baseUrl() {
    return this.config.get<string>('AI_SERVICE_URL') ?? 'http://127.0.0.1:8000';
  }
  /** No insecure default: main.ts refuses to boot without INTERNAL_API_KEY. */
  private apiKey() {
    return this.config.getOrThrow<string>('INTERNAL_API_KEY');
  }
  async scoreReduced(
    sessionId: string,
    studentId: string,
    indicators: ReducedFuzzyIndicators
  ) {
    return this.score(sessionId, studentId, indicators, 'reduced');
  }
  async scoreFull(
    sessionId: string,
    studentId: string,
    indicators: FullFuzzyIndicators
  ) {
    return this.score(sessionId, studentId, indicators, 'full');
  }
  private async score(
    sessionId: string,
    studentId: string,
    indicators: ReducedFuzzyIndicators | FullFuzzyIndicators,
    ruleSet: 'reduced' | 'full'
  ) {
    try {
      const { data } = await axios.post(
        `${this.baseUrl()}/v1/fuzzy/score`,
        {
          session_id: sessionId,
          student_id: studentId,
          indicators,
          rule_set: ruleSet,
        },
        {
          headers: {
            'X-Internal-Api-Key':
              this.apiKey(),
          },
          timeout: 5000,
        }
      );
      return data;
    } catch (error) {
      throw new ServiceUnavailableException(
        'AI scoring service is unavailable.'
      );
    }
  }
  async analyze(
    kind: 'face' | 'audio',
    sessionId: string,
    buffer: Buffer,
    filename: string,
    sampleSeconds?: number,
    mimeType?: string,
    streaks?: Record<string, number>
  ) {
    const bytes = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    const form = new FormData();
    if (kind === 'face') {
      form.append('session_id', sessionId);
      if (sampleSeconds) form.append('sample_seconds', String(sampleSeconds));
      // The AI service is stateless: it continues from the caller's counters.
      if (streaks) form.append('state', JSON.stringify(streaks));
    }
    // The AI service validates the part's media type, so it must be set
    // (a bare Blob is sent as application/octet-stream and rejected).
    form.append(
      kind === 'face' ? 'frame' : 'chunk',
      new Blob([bytes], {
        type: mimeType ?? (kind === 'face' ? 'image/jpeg' : 'audio/wav'),
      }),
      filename
    );
    try {
      const { data } = await axios.post(
        `${this.baseUrl()}/v1/analysis/${kind}`,
        form,
        {
          headers: {
            'X-Internal-Api-Key':
              this.apiKey(),
          },
          timeout: 8000,
        }
      );
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'AI analysis service is unavailable.'
      );
    }
  }
  async requestReport(payload: unknown, format: 'pdf' | 'html' | 'excel') {
    try {
      const { data } = await axios.post(
        `${this.baseUrl()}/v1/jobs/reports`,
        { payload, format },
        {
          headers: {
            'X-Internal-Api-Key':
              this.apiKey(),
          },
          timeout: 5000,
        }
      );
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'Report job service is unavailable.'
      );
    }
  }
  async jobStatus(jobId: string) {
    try {
      const { data } = await axios.get(
        `${this.baseUrl()}/v1/jobs/${jobId}`,
        {
          headers: {
            'X-Internal-Api-Key':
              this.apiKey(),
          },
          timeout: 5000,
        }
      );
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'Report job service is unavailable.'
      );
    }
  }
  async correlation(pairs: CorrelationPair[]) {
    return calculateCorrelation(pairs);
  }
  async generateQuestions(
    files: Express.Multer.File[],
    counts: QuestionCounts
  ) {
    const form = new FormData();
    for (const file of files) {
      const bytes = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength
      ) as ArrayBuffer;
      form.append(
        'files',
        new Blob([bytes], { type: file.mimetype }),
        file.originalname
      );
    }
    form.append('counts', JSON.stringify(counts));
    try {
      const { data } = await axios.post(
        `${this.baseUrl()}/v1/questions/generate`,
        form,
        {
          headers: {
            'X-Internal-Api-Key':
              this.apiKey(),
          },
          timeout: 135_000,
        }
      );
      return data;
    } 
    catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.detail) {
        throw new HttpException(
          String(error.response.data.detail),
          error.response.status
        );
      }
      throw new ServiceUnavailableException(
        'AI question generation service is unavailable.'
      );
    }
  }
}
