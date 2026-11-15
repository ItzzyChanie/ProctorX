/**
 * Simulates N students taking a monitored exam at the same time, plus one
 * teacher watching the monitor, and prints latency/error statistics.
 *
 * Per student (matching the web client): login, join, Socket.IO room +
 * heartbeat, HTTP heartbeat every 5 s, camera frame every FACE_SECONDS,
 * an audio sample on ~10% of AUDIO_SECONDS ticks (silence is gated in the
 * browser), an autosaved draft every 15 s, a tab switch now and then, and a
 * final submit.
 *
 *   node tools/loadtest/run.cjs --base http://127.0.0.1:4100 \
 *     --students 500 --duration 180 --ramp 60
 */
const { io } = require('socket.io-client');
const { readFileSync } = require('fs');
const { join } = require('path');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((part) => part.trim().split(/\s+/))
);
const BASE = args.base ?? 'http://127.0.0.1:4100';
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures.json'), 'utf8'));
const STUDENTS = Math.min(Number(args.students ?? fixtures.students.length), fixtures.students.length);
const DURATION_S = Number(args.duration ?? 180);
const RAMP_S = Number(args.ramp ?? 60);
const FACE_SECONDS = Number(args.face ?? 10);
const AUDIO_SECONDS = Number(args.audio ?? 10);
const FRAME = readFileSync(join(__dirname, 'fixtures', 'frame.jpg'));
const AUDIO = speechLikeWav(10, 16000);

// ------------------------------------------------------------------ metrics
const stats = new Map();
const errorCauses = new Map();
function record(name, ms, status) {
  const entry = stats.get(name) ?? { times: [], statuses: {} };
  entry.times.push(ms);
  entry.statuses[status] = (entry.statuses[status] ?? 0) + 1;
  stats.set(name, entry);
}
async function timed(name, fn) {
  const started = performance.now();
  let status = 'ERR';
  try {
    const response = await fn();
    status = String(response.status);
    return response;
  } catch (error) {
    status = error?.name === 'TimeoutError' ? 'TIMEOUT' : 'ERR';
    const cause = error?.cause?.code ?? error?.cause?.message ?? error?.message ?? 'unknown';
    errorCauses.set(cause, (errorCauses.get(cause) ?? 0) + 1);
    return null;
  } finally {
    record(name, performance.now() - started, status);
  }
}
const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

// --------------------------------------------------------------- utilities
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms) => ms * (0.8 + Math.random() * 0.4);
const request = (path, { cookie, json, form, method = 'POST' } = {}) =>
  fetch(BASE + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(json ? { 'content-type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : form,
    signal: AbortSignal.timeout(30_000),
  });

function speechLikeWav(seconds, rate) {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const voice = Math.sin(2 * Math.PI * 180 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t));
    buffer.writeInt16LE(Math.round(voice * 9000 + (Math.random() - 0.5) * 2000), 44 + i * 2);
  }
  return buffer;
}

async function login(loginId) {
  const response = await timed('POST /auth/login', () =>
    request('/auth/login', { json: { loginId, password: fixtures.password } })
  );
  const cookie = response?.headers.get('set-cookie')?.split(';')[0];
  if (!response?.ok || !cookie) throw new Error(`login ${loginId}: ${response?.status}`);
  return cookie;
}

// ----------------------------------------------------------------- actors
let stopping = false;
let joined = 0;
let failed = 0;
let socketsConnected = 0;

async function student(loginId, index) {
  await sleep((RAMP_S * 1000 * index) / STUDENTS);
  let cookie;
  let socket;
  try {
    cookie = await login(loginId);
    const joinResponse = await timed('POST /sessions/join', () =>
      request('/sessions/join', { cookie, json: { roomCode: fixtures.roomCode } })
    );
    if (!joinResponse?.ok) throw new Error(`join ${joinResponse?.status}`);
    const { session, exam } = await joinResponse.json();
    const id = session.id;
    joined++;

    socket = io(BASE, {
      transports: ['websocket'],
      extraHeaders: { cookie },
      reconnection: true,
    });
    socket.on('connect', () => {
      socketsConnected++;
      const started = performance.now();
      socket.emit('student:join', { sessionId: id }, (ack) =>
        record('WS student:join', performance.now() - started, ack?.ok ? 'ok' : 'rejected')
      );
    });
    socket.on('disconnect', () => socketsConnected--);

    const answers = () =>
      exam.questions.map((question) => ({
        questionId: question.id,
        selectedOptionIds: [question.options[Math.floor(Math.random() * question.options.length)].id],
      }));

    const loops = [
      [5_000, () => timed('POST heartbeat', () => request(`/sessions/${id}/heartbeat`, { cookie }))],
      [5_000, () => socket.connected && socket.emit('student:heartbeat')],
      [FACE_SECONDS * 1000, () => {
        const form = new FormData();
        form.append('frame', new Blob([FRAME], { type: 'image/jpeg' }), 'frame.jpg');
        return timed('POST camera-sample', () => request(`/sessions/${id}/camera-sample`, { cookie, form }));
      }],
      [AUDIO_SECONDS * 1000, () => {
        if (Math.random() > 0.1) return; // most chunks are silent and never sent
        const form = new FormData();
        form.append('chunk', new Blob([AUDIO], { type: 'audio/wav' }), 'sample.wav');
        return timed('POST audio-sample', () => request(`/sessions/${id}/audio-sample`, { cookie, form }));
      }],
      [15_000, () => timed('POST draft', () => request(`/sessions/${id}/draft`, { cookie, json: { answers: answers() } }))],
      [30_000, () => {
        if (Math.random() > 0.25) return;
        return timed('POST events', () => request(`/sessions/${id}/events`, { cookie, json: { type: 'TAB_SWITCH', metadata: {} } }));
      }],
    ];
    await Promise.all(
      loops.map(async ([every, action]) => {
        await sleep(Math.random() * every);
        while (!stopping) {
          await action();
          await sleep(jitter(every));
        }
      })
    );
    await timed('POST submit', () => request(`/sessions/${id}/submit`, { cookie, json: { answers: answers() } }));
  } catch (error) {
    failed++;
    if (failed <= 5) console.error(`student ${loginId}: ${error.message}`);
  } finally {
    socket?.close();
    if (cookie) await request('/auth/logout', { cookie }).catch(() => undefined);
  }
}

async function teacher() {
  const cookie = await login(fixtures.teacher);
  while (!stopping) {
    await timed('GET monitor (teacher)', () =>
      request(`/sessions/exam/${fixtures.examId}/monitor`, { cookie, method: 'GET' })
    );
    await sleep(10_000);
  }
  await request('/auth/logout', { cookie }).catch(() => undefined);
}

// -------------------------------------------------------------------- main
(async () => {
  console.log(`Simulating ${STUDENTS} students against ${BASE} for ${DURATION_S}s (ramp ${RAMP_S}s)...`);
  const started = Date.now();
  const progress = setInterval(
    () =>
      console.log(
        `  t+${Math.round((Date.now() - started) / 1000)}s joined=${joined} sockets=${socketsConnected} failed=${failed}`
      ),
    15_000
  );
  const actors = [teacher(), ...fixtures.students.slice(0, STUDENTS).map(student)];
  setTimeout(() => (stopping = true), DURATION_S * 1000);
  await Promise.all(actors);
  clearInterval(progress);

  const elapsed = (Date.now() - started) / 1000;
  const rows = [...stats.entries()].map(([name, { times, statuses }]) => {
    const sorted = [...times].sort((a, b) => a - b);
    return {
      endpoint: name,
      count: times.length,
      'p50 ms': Math.round(pct(sorted, 50)),
      'p95 ms': Math.round(pct(sorted, 95)),
      'p99 ms': Math.round(pct(sorted, 99)),
      'max ms': Math.round(sorted[sorted.length - 1] ?? 0),
      statuses: Object.entries(statuses).map(([s, n]) => `${s}:${n}`).join(' '),
    };
  });
  console.table(rows);
  if (errorCauses.size)
    console.log('Client-side errors:', Object.fromEntries(errorCauses));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  console.log(
    `students=${STUDENTS} joined=${joined} failed=${failed} requests=${total} ` +
      `throughput=${(total / elapsed).toFixed(1)} req/s elapsed=${elapsed.toFixed(0)}s`
  );
  process.exit(0);
})();
