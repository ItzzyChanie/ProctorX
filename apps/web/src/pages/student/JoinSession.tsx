import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Mic,
  Monitor,
  ShieldCheck,
} from "lucide-react"
import { DashboardLayout } from "../../components/layout/DashboardLayout"
import { Card, CardHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { api } from "../../lib/api"
import { socket } from "../../lib/socket"
import { z } from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

type Signal = {
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}
type Answer = { responseText?: string; selectedOptionIds?: string[] }
type StudentSubject = {
  id: string
  code: string
  subjectCode?: string
  schedule?: string
  name: string
  teacher: { fullName: string }
  exams: {
    assessmentType: "EXAM" | "QUIZ"
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
    endsAt: string | null
    sessions: { endedAt: string }[]
  }[]
}
const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}
const roomCodeSchema = z.string().trim().min(1).max(32)
const QUESTIONS_PER_PAGE = 10
const answerSchema = z.object({
  questionId: z.string().min(1).max(128),
  responseText: z.string().max(5000).optional(),
  selectedOptionIds: z.array(z.string().min(1).max(128)).max(1).optional(),
})

export default function JoinSession() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState("")
  const [subjectCode, setSubjectCode] = useState("")
  const [exam, setExam] = useState<any>()
  const [notice, setNotice] = useState("")
  const [locked, setLocked] = useState(false)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState<{
    totalScore: number
    maxScore: number
    gradeStatus: string
  }>()
  const [selectedSubject, setSelectedSubject] = useState<StudentSubject>()
  const [preview, setPreview] = useState<any>()
  const [consent, setConsent] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [fullscreenLost, setFullscreenLost] = useState(false)
  const mySubjects = useQuery({
    queryKey: ["student-subjects"],
    queryFn: async () =>
      (await api.get<StudentSubject[]>("/subjects/mine")).data,
    refetchInterval: 15_000,
  })
  const joinRequests = useQuery({
    queryKey: ["my-subject-join-requests"],
    queryFn: async () =>
      (await api.get<any[]>("/subjects/join-requests/mine")).data,
  })
  const requestSubject = useMutation({
    mutationFn: () =>
      api.post("/subjects/join", { code: subjectCode.trim().toUpperCase() }),
    onSuccess: () => {
      setSubjectCode("")
      setNotice(
        "Request sent. Your teacher must approve it before you can enter the subject.",
      )
      void queryClient.invalidateQueries({
        queryKey: ["my-subject-join-requests"],
      })
    },
    onError: () =>
      setNotice(
        "That subject code is invalid, already enrolled, or already requested.",
      ),
  })
  const recorder = useRef<MediaRecorder | null>(null)
  const recordingUploads = useRef<Promise<unknown>>(Promise.resolve())
  const screenStream = useRef<MediaStream | null>(null)
  const peer = useRef<RTCPeerConnection | null>(null)
  const cameraStream = useRef<MediaStream | null>(null)
  const microphoneStream = useRef<MediaStream | null>(null)
  const timers = useRef<number[]>([])
  const audioContext = useRef<AudioContext | null>(null)
  const join = async () => {
    const parsed = roomCodeSchema.safeParse(code)
    if (!parsed.success) {
      setNotice("Enter a valid room code.")
      return
    }
    try {
      const data = (
        await api.post("/sessions/preview", {
          roomCode: parsed.data.toUpperCase(),
        })
      ).data
      if (selectedSubject && data.subject.id !== selectedSubject.id)
        return setNotice("That assessment code belongs to a different subject.")
      setPreview(data)
      setNotice("")
    } catch {
      setNotice("No available published assessment matches this code.")
    }
  }
  const enterExam = async () => {
    if (!consent)
      return setNotice(
        "Confirm that you understand the monitoring requirements.",
      )
    try {
      await document.documentElement.requestFullscreen()
      setExam(
        (
          await api.post("/sessions/join", {
            roomCode: code.trim().toUpperCase(),
          })
        ).data,
      )
      setPreview(undefined)
      setSelectedSubject(undefined)
      setFullscreenLost(false)
    } catch {
      if (document.fullscreenElement) await document.exitFullscreen()
      setNotice(
        "The assessment room could not be entered. Allow fullscreen and try again.",
      )
    }
  }

  useEffect(() => {
    if (!exam) return
    let active = true
    const id = exam.session.id as string
    const examId = exam.exam.id as string
    const send = (type: string) =>
      void api.post(`/sessions/${id}/events`, { type })
    const pendingCandidates: RTCIceCandidateInit[] = []
    const closePeer = () => {
      peer.current?.close()
      peer.current = null
      pendingCandidates.splice(0)
    }
    const watch = () => {
      const stream = screenStream.current
      if (!stream) return
      closePeer()
      const connection = new RTCPeerConnection(rtcConfig)
      peer.current = connection
      stream.getTracks().forEach((track) => connection.addTrack(track, stream))
      connection.onicecandidate = ({ candidate }) =>
        candidate &&
        socket.emit("webrtc:signal", {
          sessionId: id,
          signal: { candidate: candidate.toJSON() },
        })
      socket.emit("webrtc:ready", { sessionId: id })
    }
    const signal = async (incoming: Signal) => {
      const connection = peer.current
      if (!connection) return
      if (incoming.description) {
        await connection.setRemoteDescription(incoming.description)
        while (pendingCandidates.length)
          await connection.addIceCandidate(pendingCandidates.shift()!)
        if (incoming.description.type === "offer") {
          await connection.setLocalDescription(await connection.createAnswer())
          socket.emit("webrtc:signal", {
            sessionId: id,
            signal: { description: connection.localDescription },
          })
        }
      } else if (incoming.candidate) {
        if (connection.remoteDescription)
          await connection.addIceCandidate(incoming.candidate)
        else pendingCandidates.push(incoming.candidate)
      }
    }
    let lastTabSwitchAt = 0
    const reportTabSwitch = () => {
      const now = Date.now()
      if (now - lastTabSwitchAt < 1000) return
      lastTabSwitchAt = now
      send("TAB_SWITCH")
    }
    const visibility = () => document.hidden && reportTabSwitch()
    const blur = () => reportTabSwitch()
    const fullscreen = () => {
      const exited = !document.fullscreenElement
      setFullscreenLost(exited)
      if (exited) send("FULLSCREEN_EXIT")
    }
    document.addEventListener("visibilitychange", visibility)
    document.addEventListener("fullscreenchange", fullscreen)
    window.addEventListener("blur", blur)
    const warn = (message: { message: string }) => setNotice(message.message)
    const lock = (message: { locked: boolean }) => setLocked(message.locked)
    const examEnded = async (message: { message?: string }) => {
      setNotice(message.message ?? "This assessment has ended.")
      setLocked(false)
      setExam(undefined)
      setAnswers({})
      setQuestionIndex(0)
      if (document.fullscreenElement) await document.exitFullscreen()
      void queryClient.invalidateQueries({ queryKey: ["student-subjects"] })
    }
    const joinStudentRoom = () =>
      socket.emit("student:join", { sessionId: id, examId })
    socket.on("connect", joinStudentRoom)
    socket.on("student:warn", warn)
    socket.on("student:lock", lock)
    socket.on("student:exam-ended", examEnded)
    socket.on("webrtc:request", watch)
    socket.on("webrtc:signal", signal)
    socket.on("webrtc:stop", closePeer)
    socket.connect()
    if (socket.connected) joinStudentRoom()
    void (async () => {
      try {
        // React Strict Mode immediately cleans up its first development-only
        // effect pass. Yield once so that pass cannot open a second picker.
        await Promise.resolve()
        if (!active) return
        if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen()
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        })
        if (!active) {
          screen.getTracks().forEach((track) => track.stop())
          return
        }
        screenStream.current = screen
        // A teacher can request the stream while the screen-picker is open.
        // Start signaling now that capture is actually available.
        watch()
        const screenVideo = document.createElement("video")
        screenVideo.srcObject = screen
        screenVideo.muted = true
        screenVideo.playsInline = true
        await screenVideo.play().catch((error: DOMException) => {
          if (error.name !== "AbortError") throw error
        })
        const screenCanvas = document.createElement("canvas")
        let frameEncoding = false
        const sendScreenFrame = () => {
          if (
            frameEncoding ||
            !active ||
            !socket.connected ||
            screenVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          )
            return
          const sourceWidth = screenVideo.videoWidth
          const sourceHeight = screenVideo.videoHeight
          if (!sourceWidth || !sourceHeight) return
          const width = Math.min(sourceWidth, 960)
          const height = Math.round((sourceHeight / sourceWidth) * width)
          screenCanvas.width = width
          screenCanvas.height = height
          screenCanvas
            .getContext("2d")
            ?.drawImage(screenVideo, 0, 0, width, height)
          frameEncoding = true
          screenCanvas.toBlob(
            async (blob) => {
              try {
                if (!blob || !active || !socket.connected) return
                socket.volatile.emit("screen:frame", {
                  sessionId: id,
                  frame: await blob.arrayBuffer(),
                  mimeType: blob.type,
                })
              } finally {
                frameEncoding = false
              }
            },
            "image/webp",
            0.55,
          )
        }
        sendScreenFrame()
        // Roughly 8 FPS gives a near-live preview without allowing slow frame
        // encoding or network delivery to build an ever-growing queue.
        timers.current.push(window.setInterval(sendScreenFrame, 125))
        const mediaRecorder = new MediaRecorder(screen)
        recorder.current = mediaRecorder
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size) {
            const form = new FormData()
            form.append("chunk", event.data)
            recordingUploads.current = recordingUploads.current
              .then(() => api.post(`/sessions/${id}/recording-chunks`, form))
              .catch(() =>
                setNotice("A screen-recording segment could not be saved."),
              )
          }
        }
        mediaRecorder.start(5000)
        if (exam.exam.requireCamera) {
          cameraStream.current = await navigator.mediaDevices.getUserMedia({
            video: true,
          })
          const video = document.createElement("video")
          video.srcObject = cameraStream.current
          video.muted = true
          await video.play().catch((error: DOMException) => {
            if (error.name !== "AbortError") throw error
          })
          const sample = () => {
            const canvas = document.createElement("canvas")
            canvas.width = 640
            canvas.height = 480
            canvas.getContext("2d")?.drawImage(video, 0, 0)
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const form = new FormData()
                  form.append("frame", blob, "frame.jpg")
                  void api.post(`/sessions/${id}/camera-sample`, form)
                }
              },
              "image/jpeg",
              0.75,
            )
          }
          sample()
          timers.current.push(window.setInterval(sample, 3000))
        }
        if (exam.exam.requireMicrophone) {
          microphoneStream.current = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
          })
          const context = new AudioContext({ sampleRate: 48000 })
          audioContext.current = context
          const source = context.createMediaStreamSource(
            microphoneStream.current,
          )
          const processor = context.createScriptProcessor(4096, 1, 1)
          const pcm: number[] = []
          processor.onaudioprocess = (event) =>
            pcm.push(...event.inputBuffer.getChannelData(0))
          source.connect(processor)
          processor.connect(context.destination)
          const sample = () => {
            const samples = pcm.splice(0),
              rate = context.sampleRate
            if (!samples.length || ![8000, 16000, 32000, 48000].includes(rate))
              return
            const data = new ArrayBuffer(44 + samples.length * 2),
              view = new DataView(data),
              write = (offset: number, text: string) =>
                [...text].forEach((char, index) =>
                  view.setUint8(offset + index, char.charCodeAt(0)),
                )
            write(0, "RIFF")
            view.setUint32(4, 36 + samples.length * 2, true)
            write(8, "WAVEfmt ")
            view.setUint32(16, 16, true)
            view.setUint16(20, 1, true)
            view.setUint16(22, 1, true)
            view.setUint32(24, rate, true)
            view.setUint32(28, rate * 2, true)
            view.setUint16(32, 2, true)
            view.setUint16(34, 16, true)
            write(36, "data")
            view.setUint32(40, samples.length * 2, true)
            samples.forEach((sample, index) =>
              view.setInt16(
                44 + index * 2,
                Math.max(-1, Math.min(1, sample)) * 32767,
                true,
              ),
            )
            const form = new FormData()
            form.append(
              "chunk",
              new Blob([data], { type: "audio/wav" }),
              "sample.wav",
            )
            void api.post(`/sessions/${id}/audio-sample`, form)
          }
          timers.current.push(window.setInterval(sample, 4000))
        }
      } catch {
        if (active)
          setNotice(
            "Required screen, camera, or microphone permission was not granted.",
          )
      }
    })()
    return () => {
      active = false
      document.removeEventListener("visibilitychange", visibility)
      document.removeEventListener("fullscreenchange", fullscreen)
      window.removeEventListener("blur", blur)
      socket.off("connect", joinStudentRoom)
      socket.off("student:warn", warn)
      socket.off("student:lock", lock)
      socket.off("student:exam-ended", examEnded)
      socket.off("webrtc:request", watch)
      socket.off("webrtc:signal", signal)
      socket.off("webrtc:stop", closePeer)
      timers.current.forEach(window.clearInterval)
      timers.current = []
      audioContext.current?.close()
      closePeer()
      if (recorder.current?.state !== "inactive") recorder.current?.stop()
      ;[
        screenStream.current,
        cameraStream.current,
        microphoneStream.current,
      ].forEach((stream) =>
        stream?.getTracks().forEach((track) => track.stop()),
      )
      socket.disconnect()
    }
  }, [exam])
  const submit = async () => {
    const unanswered = exam.exam.questions.findIndex((question: any) => {
      if (!question.isRequired) return false
      const answer = answers[question.id]
      return question.type === "MULTIPLE_CHOICE"
        ? !answer?.selectedOptionIds?.length
        : !answer?.responseText?.trim()
    })
    if (unanswered >= 0) {
      setQuestionIndex(Math.floor(unanswered / QUESTIONS_PER_PAGE))
      setNotice("Answer all required questions before submitting.")
      return
    }
    const payload = {
      answers: exam.exam.questions.map((question: any) => ({
        questionId: question.id,
        ...answers[question.id],
      })),
    }
    const parsed = z
      .object({ answers: z.array(answerSchema) })
      .safeParse(payload)
    if (!parsed.success) {
      setNotice("One or more answers are invalid.")
      return
    }
    try {
      const activeRecorder = recorder.current
      if (activeRecorder && activeRecorder.state !== "inactive") {
        const stopped = new Promise<void>((resolve) =>
          activeRecorder.addEventListener("stop", () => resolve(), {
            once: true,
          }),
        )
        activeRecorder.stop()
        await stopped
        await recordingUploads.current
      }
      const response = await api.post(
        `/sessions/${exam.session.id}/submit`,
        parsed.data,
      )
      const result = response.data
      const showScore =
        result.gradeStatus === "TEACHER_CONFIRMED" && result.maxScore > 0
      setFullscreenLost(false)
      if (document.fullscreenElement) await document.exitFullscreen()
      void queryClient.invalidateQueries({ queryKey: ["student-subjects"] })
      if (showScore) {
        setScore(result)
        setSubmitted(true)
      } else {
        setExam(undefined)
        setAnswers({})
        setQuestionIndex(0)
        setNotice(
          `${
            exam.exam.assessmentType === "QUIZ" ? "Quiz" : "Exam"
          } submitted successfully.`,
        )
      }
    } catch {
      setNotice("Your answers could not be submitted. Please try again.")
    }
  }
  if (!exam)
    return (
      <DashboardLayout role="student" pageTitle="Join Session">
        {notice && (
          <div
            role="status"
            className={`mb-4 rounded border p-3 text-sm font-medium ${
              notice.startsWith("Request sent.") ||
              notice.includes("submitted successfully")
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-red-300 bg-red-50 text-red-700"
            }`}
          >
            {notice}
          </div>
        )}
        <Card>
          <CardHeader
            title="Join a subject"
            subtitle="Enter the code from your teacher. Enrollment starts only after approval."
          />
          <input
            value={subjectCode}
            onChange={(event) =>
              setSubjectCode(event.target.value.toUpperCase())
            }
            placeholder="Subject join code"
            maxLength={30}
            className="my-4 w-full rounded border p-3"
          />
          <Button
            disabled={requestSubject.isPending || !subjectCode.trim()}
            onClick={() => requestSubject.mutate()}
            icon={LogIn}
          >
            {requestSubject.isPending ? "Sending…" : "Request to join"}
          </Button>
          {!!joinRequests.data?.length && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-xs font-bold uppercase text-text-3">
                Recent requests
              </div>
              {joinRequests.data.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="flex justify-between py-2 text-sm"
                >
                  <span>{request.subject.name}</span>
                  <span
                    className={
                      request.status === "APPROVED"
                        ? "text-risk-low"
                        : request.status === "DECLINED"
                          ? "text-risk-high"
                          : "text-amber-600"
                    }
                  >
                    {request.status.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="mt-5" padded={false}>
          <div className="p-6">
            <CardHeader
              title="My Subjects"
              subtitle="Enter an assessment room from one of your approved subjects."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-y border-border bg-surface-2 text-xs uppercase text-text-3">
                <tr>
                  <th className="p-4 text-left">Subject</th>
                  <th className="p-4 text-left">Teacher</th>
                  <th className="p-4 text-left">Assessment Available</th>
                  <th className="p-4 text-left">Status</th>
                  <th className="p-4 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {mySubjects.data?.map((subject) => {
                  const latest = subject.exams[0]
                  const completed = !!latest?.sessions.length
                  const available =
                    !!latest &&
                    latest.status === "PUBLISHED" &&
                    (!latest.endsAt || new Date(latest.endsAt) > new Date())
                  return (
                    <tr
                      key={subject.id}
                      className="border-b border-border text-left"
                    >
                      <td className="p-4 text-left font-semibold">
                        {subject.subjectCode} - {subject.name}
                        {subject.schedule ? ` | ${subject.schedule}` : ""}
                      </td>
                      <td className="p-4 text-left">
                        {subject.teacher.fullName}
                      </td>
                      <td className="p-4 text-left">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            available
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {available ? "1 Exam/Quiz" : "No Exam/Quiz"}
                        </span>
                      </td>
                      <td className="p-4 text-left">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            completed
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {completed
                            ? "Exam/Quiz Taken"
                            : "Exam/Quiz Not yet taken"}
                        </span>
                      </td>
                      <td className="p-4 text-left">
                        <Button
                          disabled={!available || completed}
                          onClick={() => {
                            setSelectedSubject(subject)
                            setCode("")
                            setPreview(undefined)
                            setConsent(false)
                          }}
                          icon={LogIn}
                        >
                          Join
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!mySubjects.isLoading && !mySubjects.data?.length && (
            <p className="p-6 text-sm text-text-2">No approved subjects yet.</p>
          )}
        </Card>
        {selectedSubject && (
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4">
            <Card className="w-full max-w-xl">
              <div className="flex justify-between">
                <CardHeader
                  title={`Join ${selectedSubject.subjectCode} - ${selectedSubject.name}`}
                  subtitle="Use the assessment code provided by your teacher."
                />
                <button onClick={() => setSelectedSubject(undefined)}>
                  <span className="sr-only">Close</span>×
                </button>
              </div>
              {!preview ? (
                <div className="space-y-4">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded border border-border p-3"
                    placeholder="Exam or quiz code"
                    maxLength={32}
                  />
                  <div className="flex justify-end">
                    <Button onClick={() => void join()}>Continue</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-brand-soft p-4">
                    <b>{preview.title}</b>
                    <p className="mt-1 text-sm">
                      {preview.assessmentType === "QUIZ" ? "Quiz" : "Exam"} ·{" "}
                      {preview.questionCount} items
                    </p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <p className="flex gap-2">
                      <Monitor className="shrink-0 text-brand" size={18} />
                      This assessment is monitored and will enter fullscreen
                      automatically. Leaving fullscreen blocks the exam and is
                      recorded.
                    </p>
                    <p className="flex gap-2">
                      <Camera className="shrink-0 text-brand" size={18} />
                      {preview.requireCamera
                        ? "Your camera will capture monitoring samples."
                        : "Camera monitoring is not required."}
                    </p>
                    <p className="flex gap-2">
                      <Mic className="shrink-0 text-brand" size={18} />
                      {preview.requireMicrophone
                        ? "Microphone audio will be analyzed for voice activity."
                        : "Microphone monitoring is not required."}
                    </p>
                    <p className="flex gap-2">
                      <AlertTriangle
                        className="shrink-0 text-amber-600"
                        size={18}
                      />
                      Tab switching, fullscreen exits, prohibited apps, and
                      other configured cheating signals may be recorded.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      By checking this, I understand that this assessment is
                      monitored and I agree to enter the exam room.
                    </span>
                  </label>
                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      onClick={() => setPreview(undefined)}
                    >
                      Back
                    </Button>
                    <Button
                      icon={ShieldCheck}
                      disabled={!consent}
                      onClick={() => void enterExam()}
                    >
                      Enter Exam Room
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </DashboardLayout>
    )
  return (
    <DashboardLayout role="student" pageTitle="Exam">
      <div className="fixed inset-0 z-50 overflow-auto bg-surface p-6">
        {notice && (
          <div className="mb-4 rounded bg-amber-100 p-3">{notice}</div>
        )}
        {locked && (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 text-xl text-white">
            Exam locked by teacher.
          </div>
        )}
        {fullscreenLost && !submitted && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-6 text-center text-white">
            <div>
              <Monitor className="mx-auto mb-3" size={38} />
              <h2 className="text-xl font-bold">Fullscreen is required</h2>
              <p className="my-3 text-sm text-white/80">
                Your fullscreen exit was recorded. Re-enter fullscreen to
                continue.
              </p>
              <Button
                onClick={async () => {
                  try {
                    await document.documentElement.requestFullscreen()
                    setFullscreenLost(false)
                  } catch {
                    setNotice("Fullscreen permission is required to continue.")
                  }
                }}
              >
                Return to fullscreen
              </Button>
            </div>
          </div>
        )}
        {submitted ? (
          <div className="grid min-h-full place-items-center text-center">
            <div>
              <h1 className="text-2xl font-bold">Exam submitted</h1>
              <p className="mt-2 text-text-2">
                Your responses were saved for grading.
              </p>
              {score?.gradeStatus === "TEACHER_CONFIRMED" &&
                score.maxScore > 0 && (
                  <div className="mt-5 rounded-xl bg-emerald-50 p-5 text-emerald-800">
                    <div className="text-sm font-semibold">Automatic score</div>
                    <div className="mt-1 text-3xl font-bold">
                      {score.totalScore} / {score.maxScore}
                    </div>
                  </div>
                )}
              <Button
                className="mt-5"
                onClick={() => {
                  setExam(undefined)
                  setSubmitted(false)
                  setScore(undefined)
                  setAnswers({})
                  setQuestionIndex(0)
                }}
              >
                Return to My Subjects
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-4 max-w-5xl">
              <h1 className="text-xl font-bold">{exam.exam.title}</h1>
              {exam.exam.instructions && (
                <p className="mt-1 text-sm text-text-2">
                  {exam.exam.instructions}
                </p>
              )}
            </div>
            {exam.exam.sourceType === "GOOGLE_FORMS_IMPORT" &&
            exam.exam.externalFormUrl ? (
              <div className="mx-auto max-w-5xl">
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                  <iframe
                    title={exam.exam.title}
                    src={exam.exam.externalFormUrl}
                    className="h-[calc(100vh-190px)] min-h-[600px] w-full"
                    sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <a
                    className="text-sm font-semibold text-brand underline"
                    href={exam.exam.externalFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open form in a new tab if it does not load
                  </a>
                  <Button onClick={() => void submit()}>
                    I submitted the Google Form
                  </Button>
                </div>
                <p className="mt-2 text-xs text-text-2">
                  Submit inside Google Forms first, then use the button above to
                  complete your monitored ProctorX session.
                </p>
              </div>
            ) : (
              <>
                <fieldset disabled={locked} className="mx-auto max-w-3xl">
                  {exam.exam.questions
                    .slice(
                      questionIndex * QUESTIONS_PER_PAGE,
                      (questionIndex + 1) * QUESTIONS_PER_PAGE,
                    )
                    .map((question: any, pageOffset: number) => (
                      <div
                        key={question.id}
                        className="my-4 rounded border p-4"
                      >
                        <b>
                          {questionIndex * QUESTIONS_PER_PAGE + pageOffset + 1}.{" "}
                          {question.prompt}
                        </b>
                        {question.options?.map((option: any) => (
                          <label key={option.id} className="mt-2 block">
                            <input
                              type="radio"
                              checked={
                                answers[question.id]?.selectedOptionIds?.[0] ===
                                option.id
                              }
                              onChange={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: {
                                    selectedOptionIds: [option.id],
                                  },
                                }))
                              }
                              name={question.id}
                            />{" "}
                            {option.label}
                          </label>
                        ))}
                        {question.type !== "MULTIPLE_CHOICE" && (
                          <textarea
                            value={answers[question.id]?.responseText ?? ""}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: {
                                  responseText: event.target.value,
                                },
                              }))
                            }
                            className="mt-3 w-full rounded border p-2"
                            placeholder={
                              question.type === "ESSAY"
                                ? "Write your answer"
                                : "Your answer"
                            }
                          />
                        )}
                      </div>
                    ))}
                </fieldset>
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    icon={ChevronLeft}
                    disabled={questionIndex === 0}
                    onClick={() => setQuestionIndex((i) => Math.max(0, i - 1))}
                  >
                    Back
                  </Button>
                  <span className="text-sm text-text-2">
                    Page {questionIndex + 1} of{" "}
                    {Math.ceil(exam.exam.questions.length / QUESTIONS_PER_PAGE)}
                  </span>
                  {questionIndex <
                  Math.ceil(exam.exam.questions.length / QUESTIONS_PER_PAGE) -
                    1 ? (
                    <Button
                      icon={ChevronRight}
                      onClick={() => {
                        const page = exam.exam.questions.slice(
                            questionIndex * QUESTIONS_PER_PAGE,
                            (questionIndex + 1) * QUESTIONS_PER_PAGE,
                          ),
                          missing = page.some((q: any) => {
                            if (!q.isRequired) return false
                            const a = answers[q.id]
                            return q.type === "MULTIPLE_CHOICE"
                              ? !a?.selectedOptionIds?.length
                              : !a?.responseText?.trim()
                          })
                        if (missing)
                          return setNotice(
                            "Answer all required questions on this page before continuing.",
                          )
                        setQuestionIndex((i) => i + 1)
                      }}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button onClick={() => void submit()}>
                      Submit{" "}
                      {exam.exam.assessmentType === "QUIZ" ? "quiz" : "exam"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
