import io, wave
import webrtcvad
def analyze_audio(audio: bytes):
    with wave.open(io.BytesIO(audio), "rb") as wav:
        rate, channels, width, frames = wav.getframerate(), wav.getnchannels(), wav.getsampwidth(), wav.readframes(wav.getnframes())
    if rate not in (8000,16000,32000,48000) or channels != 1 or width != 2: raise ValueError("Audio must be mono 16-bit PCM WAV at a WebRTC VAD sample rate")
    vad=webrtcvad.Vad(2); frame_len=rate*30//1000*2; chunks=[frames[i:i+frame_len] for i in range(0,len(frames)-frame_len+1,frame_len)]; voiced=sum(vad.is_speech(chunk,rate) for chunk in chunks); intensity=voiced/max(1,len(chunks)); duration=len(chunks)*.03
    return {"voice_detected":{"event": intensity >= .2, "intensity":round(intensity,3), "duration_seconds":round(duration,2)}}
