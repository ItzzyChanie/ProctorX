import { useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { socket } from "../../lib/socket";

type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function JoinSession() {
  const [code, setCode] = useState(""); const [exam, setExam] = useState<any>(); const [notice, setNotice] = useState(""); const [locked, setLocked] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null); const screenStream = useRef<MediaStream | null>(null); const peer = useRef<RTCPeerConnection | null>(null); const cameraStream = useRef<MediaStream | null>(null); const microphoneStream = useRef<MediaStream | null>(null); const samplingTimers = useRef<number[]>([]); const audioContext = useRef<AudioContext | null>(null);
  const join = async () => { try { setExam((await api.post("/sessions/join", { roomCode: code })).data); } catch { setNotice("No published enrolled exam matches this room code."); } };

  useEffect(() => {
    if (!exam) return;
    const id = exam.session.id as string; const examId = exam.exam.id as string;
    const send = (type: string) => void api.post(`/sessions/${id}/events`, { type });
    const visible = () => document.hidden && send("TAB_SWITCH");
    const full = () => { if (!document.fullscreenElement) { send("FULLSCREEN_EXIT"); setNotice("Fullscreen is required."); } };
    const closePeer = () => { peer.current?.close(); peer.current = null; };
    const requestWatch = () => {
      const stream = screenStream.current; if (!stream) return;
      closePeer(); const connection = new RTCPeerConnection(rtcConfig); peer.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      connection.onicecandidate = ({ candidate }) => candidate && socket.emit("webrtc:signal", { sessionId: id, signal: { candidate: candidate.toJSON() } });
      socket.emit("webrtc:ready", { sessionId: id });
    };
    const receiveSignal = async (signal: Signal) => {
      const connection = peer.current; if (!connection) return;
      if (signal.description) { await connection.setRemoteDescription(signal.description); if (signal.description.type === "offer") { const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); socket.emit("webrtc:signal", { sessionId: id, signal: { description: connection.localDescription } }); } }
      else if (signal.candidate) await connection.addIceCandidate(signal.candidate);
    };
    document.addEventListener("visibilitychange", visible); document.addEventListener("fullscreenchange", full);
    socket.connect(); socket.emit("student:join", { sessionId: id, examId }); socket.on("student:warn", (x: { message: string }) => setNotice(x.message)); socket.on("student:lock", (x: { locked: boolean }) => setLocked(x.locked)); socket.on("webrtc:request", requestWatch); socket.on("webrtc:signal", receiveSignal); socket.on("webrtc:stop", closePeer);
    void (async () => { try { await document.documentElement.requestFullscreen(); const stream = await navigator.mediaDevices.getDisplayMedia({ video:true }); screenStream.current=stream; const mediaRecorder=new MediaRecorder(stream);recorder.current=mediaRecorder;mediaRecorder.ondataavailable=async(event)=>{if(event.data.size){const file=new FormData();file.append("chunk",event.data);await api.post(`/sessions/${id}/recording-chunks`,file)}};mediaRecorder.start(5000);
      if(exam.exam.requireCamera){cameraStream.current=await navigator.mediaDevices.getUserMedia({video:true});const video=document.createElement("video");video.srcObject=cameraStream.current;video.muted=true;await video.play();const capture=()=>{const canvas=document.createElement("canvas");canvas.width=640;canvas.height=480;canvas.getContext("2d")?.drawImage(video,0,0,640,480);canvas.toBlob(async(blob)=>{if(blob){const form=new FormData();form.append("frame",blob,"frame.jpg");await api.post(`/sessions/${id}/camera-sample`,form)}},"image/jpeg",.75)};capture();samplingTimers.current.push(window.setInterval(capture,3000));}
      if(exam.exam.requireMicrophone){microphoneStream.current=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});const context=new AudioContext({sampleRate:16000});audioContext.current=context;const source=context.createMediaStreamSource(microphoneStream.current);const processor=context.createScriptProcessor(4096,1,1);const pcm:number[]=[];processor.onaudioprocess=(event)=>pcm.push(...event.inputBuffer.getChannelData(0));source.connect(processor);processor.connect(context.destination);const sendAudio=()=>{const samples=pcm.splice(0);if(!samples.length)return;const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);const write=(offset:number,text:string)=>[...text].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));write(0,"RIFF");view.setUint32(4,36+samples.length*2,true);write(8,"WAVEfmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,samples.length*2,true);samples.forEach((sample,index)=>view.setInt16(44+index*2,Math.max(-1,Math.min(1,sample))*32767,true));const form=new FormData();form.append("chunk",new Blob([buffer],{type:"audio/wav"}),"sample.wav");void api.post(`/sessions/${id}/audio-sample`,form)};samplingTimers.current.push(window.setInterval(sendAudio,4000));}
    } catch { setNotice("Required screen, camera, or microphone permission was not granted."); } })();
    return () => { document.removeEventListener("visibilitychange", visible); document.removeEventListener("fullscreenchange", full); samplingTimers.current.forEach(window.clearInterval); samplingTimers.current=[]; audioContext.current?.close(); closePeer(); recorder.current?.stop(); screenStream.current?.getTracks().forEach((track) => track.stop()); cameraStream.current?.getTracks().forEach((track)=>track.stop()); microphoneStream.current?.getTracks().forEach((track)=>track.stop()); socket.disconnect(); };
  }, [exam]);

  return <DashboardLayout role="student" pageTitle="Join Session"><Card>{!exam ? <><CardHeader title="Enter room code" subtitle="Fullscreen and screen recording start after joining." /><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="my-4 w-full rounded border p-3" /><Button onClick={() => void join()} icon={LogIn}>Join exam</Button></> : <div className="fixed inset-0 z-50 overflow-auto bg-surface p-6">{notice && <div className="mb-4 rounded bg-amber-100 p-3">{notice}</div>}<h1 className="text-xl font-bold">{exam.exam.title}</h1>{locked && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 text-xl text-white">Exam locked by teacher.</div>}<fieldset disabled={locked}>{exam.exam.questions.map((question: any, index: number) => <div key={question.id} className="my-4 rounded border p-4"><b>{index + 1}. {question.prompt}</b>{question.options?.map((option: any) => <label key={option.id} className="block"><input type="radio" name={question.id} />{option.label}</label>)}</div>)}</fieldset><button onClick={() => void document.documentElement.requestFullscreen()} className="rounded bg-brand px-3 py-2 text-white">Return to fullscreen</button></div>}</Card></DashboardLayout>;
}
