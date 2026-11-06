import asyncio, json, os, tempfile, wave, subprocess
import numpy as np, requests, websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from av import AudioFrame
from faster_whisper import WhisperModel

API=os.getenv("ESTATEPILOT_SIGNAL_URL","ws://localhost:4000")
ROOM=os.environ["ESTATEPILOT_ROOM_ID"]
OLLAMA=os.getenv("OLLAMA_URL","http://localhost:11434")
MODEL=os.getenv("OLLAMA_MODEL","llama3.2:3b")
PIPER=os.getenv("PIPER_BIN","piper")
VOICE=os.getenv("PIPER_VOICE","voices/en_US-lessac-medium.onnx")
SYSTEM="""You are EstatePilot, a polite AI real-estate receptionist. Disclose that you are an AI. Reply in the caller's language, Telugu or English. Ask about property type, preferred location and configuration. NEVER ask about budget, income, loans or affordability. Never invent property facts, quote unapproved total prices, negotiate or promise discounts. If asked for unavailable facts, offer human follow-up. Respect stop requests. Keep replies short and ask one question at a time."""

class Speaker(MediaStreamTrack):
 kind="audio"
 def __init__(self): super().__init__(); self.q=asyncio.Queue(); self.pts=0
 async def recv(self):
  data=await self.q.get(); frame=AudioFrame(format="s16",layout="mono",samples=len(data))
  frame.planes[0].update(data.tobytes()); frame.sample_rate=24000; frame.pts=self.pts; frame.time_base="1/24000"; self.pts+=len(data); return frame
 async def play(self,path):
  with wave.open(path,"rb") as w: rate=w.getframerate(); ch=w.getnchannels(); a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)
  if ch>1: a=a.reshape(-1,ch).mean(axis=1).astype(np.int16)
  if rate!=24000: a=np.interp(np.linspace(0,len(a)-1,int(len(a)*24000/rate)),np.arange(len(a)),a).astype(np.int16)
  for i in range(0,len(a),960): await self.q.put(a[i:i+960])

def llm(history):
 r=requests.post(OLLAMA+"/api/chat",json={"model":MODEL,"messages":[{"role":"system","content":SYSTEM},*history],"stream":False},timeout=90); r.raise_for_status(); return r.json()["message"]["content"].strip()
def tts(text,path):
 with open(path,"wb") as out: subprocess.run([PIPER,"--model",VOICE,"--output_file",path],input=text.encode(),stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)

async def audio_loop(track,speaker,history,whisper):
 frames=[]; count=0
 while True:
  f=await track.recv(); a=f.to_ndarray().astype(np.float32)
  if a.ndim>1: a=a.mean(axis=0)
  frames.extend(a.tolist()); count+=len(a)
  if count<48000: continue
  chunk=np.asarray(frames,dtype=np.float32); frames=[]; count=0
  if np.max(np.abs(chunk))<250: continue
  # Browser WebRTC audio is commonly 48 kHz; Whisper input is 16 kHz.
  chunk=np.interp(np.linspace(0,len(chunk)-1,int(len(chunk)/3)),np.arange(len(chunk)),chunk).astype(np.float32)
  with tempfile.NamedTemporaryFile(suffix=".wav",delete=False) as t: path=t.name
  try:
   with wave.open(path,"wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(np.clip(chunk,-32768,32767).astype(np.int16).tobytes())
   seg,_=await asyncio.to_thread(whisper.transcribe,path,beam_size=1,vad_filter=True); text=" ".join(s.text.strip() for s in seg).strip()
  finally: os.unlink(path)
  if not text: continue
  print("Customer:",text,flush=True); history.append({"role":"user","content":text})
  answer=await asyncio.to_thread(llm,history[-12:]); history.append({"role":"assistant","content":answer}); print("AI:",answer,flush=True)
  with tempfile.NamedTemporaryFile(suffix=".wav",delete=False) as t: out=t.name
  try: await asyncio.to_thread(tts,answer,out); await speaker.play(out)
  finally: os.unlink(out)

async def main():
 whisper=await asyncio.to_thread(WhisperModel,os.getenv("WHISPER_MODEL","small"),device=os.getenv("WHISPER_DEVICE","cpu"),compute_type=os.getenv("WHISPER_COMPUTE_TYPE","int8"))
 pc=RTCPeerConnection(); speaker=Speaker(); pc.addTrack(speaker); history=[{"role":"assistant","content":"Hello, I am EstatePilot's AI receptionist. Would you prefer Telugu or English?"}]
 @pc.on("track")
 def on_track(track):
  if track.kind=="audio": asyncio.create_task(audio_loop(track,speaker,history,whisper))
 async with websockets.connect(f"{API}/webrtc/{ROOM}") as ws:
  async for raw in ws:
   m=json.loads(raw); typ=m.get("type")
   if typ=="peer-joined":
    offer=await pc.createOffer(); await pc.setLocalDescription(offer)
    await ws.send(json.dumps({"type":"offer","payload":{"sdp":pc.localDescription.sdp,"type":pc.localDescription.type}}))
   elif typ=="answer":
    p=m["payload"]; await pc.setRemoteDescription(RTCSessionDescription(sdp=p["sdp"],type=p["type"]))
   elif typ=="ice-candidate":
    # ICE trickle parsing is intentionally deferred; use TURN/STUN config in production.
    pass
   elif typ=="peer-left": break
 await pc.close()

if __name__=="__main__": asyncio.run(main())
