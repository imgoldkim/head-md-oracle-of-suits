// (replaced recording variables with live-mic variables)
// audio / blink state additions
let audioCtx = null;
let micStream = null;
let micSource = null;
let micDest = null;
let audioEl = null;
let liveMicOn = false;
let baseRate = 1.0; // original pitch / playbackRate
let maxShift = 1.5; // multiplier when fully blinked
let liveBtn;
let mirrorVideo = true; // true = mirror the camera feed on screen

// new: blink trigger state
let prevLeftEyeBlinkScore = 1.0; // assume open initially
let lastBlinkAt = 0;
const blinkCooldown = 300; // ms between triggers

// new: square blob variables
let prevLeftSquare = 0;
const squareMaxSize = 40; // reduced from 80 to make blob smaller
const squareColor = [0, 255, 0, 180]; // green rgba (last is alpha)

// --- ADD RIGHT EYE VARIABLES ---
let prevRightEyeBlinkScore = 1.0; // assume open initially
let prevRightSquare = 0;
const rightEyeIdx = [362, 263, 386, 374]; // typical MediaPipe right-eye indices

// MOUTH blob variables
let prevMouthSize = 0;
let prevMouthX = 0;
let prevMouthY = 0;
const mouthMaxSize = 80;
const mouthColor = [255, 120, 100, 200]; // rgba

// --- NEW: synth sample (toggle on mouth open) ---
let synthBuffer = null;
const synthUrl = './synth.wav';
let synthLoopOn = false;
let synthSource = null;
let synthGain = null;
let synthAudioEl = null; // fallback HTMLAudio element
let prevMouthPlaying = false;
let prevMouthOpen = false; // track previous mouth-open state (rising-edge)
let lastMouthAt = 0;
const mouthCooldown = 300; // ms between toggles

async function loadSynth() {
  try {
    ensureAudioCtx();
    if (synthBuffer) return;
    const res = await fetch(synthUrl);
    const ab = await res.arrayBuffer();
    synthBuffer = await audioCtx.decodeAudioData(ab);
    console.log('Synth loaded, duration:', synthBuffer.duration);
  } catch (e) {
    console.warn('Failed to load synth sample:', e);
    synthBuffer = null;
  }
}

function startSynthLoop() {
  ensureAudioCtx();
  if (synthLoopOn) return;
  if (synthBuffer) {
    const now = audioCtx.currentTime;
    synthGain = audioCtx.createGain();
    synthGain.gain.value = 0.9;
    synthSource = audioCtx.createBufferSource();
    synthSource.buffer = synthBuffer;
    synthSource.loop = true;
    synthSource.connect(synthGain);
    synthGain.connect(audioCtx.destination);
    try { synthSource.start(now); } catch (e) { synthSource.start(); }
    synthLoopOn = true;
  } else {
    try {
      if (!synthAudioEl) synthAudioEl = new Audio(synthUrl);
      synthAudioEl.loop = true;
      synthAudioEl.volume = 0.9;
      synthAudioEl.play().catch(()=>{});
      synthLoopOn = true;
    } catch (e) { console.warn('Failed to start synth audio fallback:', e); }
  }
}

function stopSynthLoop() {
  if (!synthLoopOn) return;
  if (synthSource) {
    try { synthSource.stop(); } catch (e) {}
    try { synthSource.disconnect(); synthGain.disconnect(); } catch (e) {}
    synthSource = null; synthGain = null;
  }
  if (synthAudioEl) {
    try { synthAudioEl.pause(); synthAudioEl.currentTime = 0; synthAudioEl.loop = false; } catch (e) {}
  }
  synthLoopOn = false;
}

// new: snippet recording/playback for triad from live input
let recorderNode = null;
let isRecordingSnippet = false;
let snippetBuffers = [];
let snippetTargetSamples = 0;
const snippetDurationSec = 0.45; // record ~450ms of live input
const triadGains = [0.6, 0.45, 0.45]; // per-voice relative gains (tweak)

// new: kick file buffer
let kickBuffer = null;
const kickUrl = './kick1.wav'; // changed to explicit relative path (kick1.wav placed in same folder)

// NEW: clap file buffer (play when right eye blinks)
let clapBuffer = null;
const clapUrl = './Clap.wav';

// visual flash helper (top-level) to indicate clap triggered
let clapFlashUntil = 0;
function flashClapVisual() {
  clapFlashUntil = millis() + 220;
}

async function loadClap() {
  try {
    ensureAudioCtx();
    if (clapBuffer) return;
    console.log('Loading clap sample from', clapUrl);
    const res = await fetch(clapUrl);
    const ab = await res.arrayBuffer();
    clapBuffer = await audioCtx.decodeAudioData(ab);
    console.log('Clap sample loaded, duration:', clapBuffer.duration);
  } catch (e) {
    console.warn('Failed to load clap sample:', e);
    clapBuffer = null;
  }
}

function playClap(intensity = 1.0) {
  ensureAudioCtx();
  console.log('playClap called, intensity=', intensity, 'audioCtx.state=', audioCtx && audioCtx.state);
  if (clapBuffer) {
    const now = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = clapBuffer;
    // slight pitch variation based on intensity
    src.playbackRate.value = 1.0 + (intensity - 0.5) * 0.4;
    const g = audioCtx.createGain();
    g.gain.value = Math.min(1.0, 0.25 + intensity * 0.9);
    src.connect(g);
    g.connect(audioCtx.destination);
    src.start(now);
    // visual flash to show the event (short-lived)
    flashClapVisual();
    setTimeout(() => {
      try { src.disconnect(); g.disconnect(); } catch (e) {}
    }, (clapBuffer.duration / src.playbackRate.value + 0.1) * 1000);
  } else {
    // fallback to HTML Audio element (may be blocked until user gesture)
    try {
      const a = new Audio(clapUrl);
      a.playbackRate = 1.0 + (intensity - 0.5) * 0.4;
      a.volume = Math.min(1.0, 0.25 + intensity * 0.9);
      a.play().catch(()=>{/*ignore autoplay failure*/});
    } catch (e) {}
  }
}

// new: left-loop state for continuous kick
let leftLoopOn = false;
let leftLoopSource = null;
let leftLoopGain = null;

// helper: load and decode kick sample
async function loadKick() {
  try {
    ensureAudioCtx();
    if (kickBuffer) return;
    const res = await fetch(kickUrl);
    const ab = await res.arrayBuffer();
    kickBuffer = await audioCtx.decodeAudioData(ab);
  } catch (e) {
    console.warn('Failed to load kick sample:', e);
    kickBuffer = null;
  }
}

// play kick via AudioContext if loaded, else fallback to HTMLAudioElement
function playKick(intensity = 1.0) {
  ensureAudioCtx();
  if (kickBuffer) {
    const now = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = kickBuffer;
    // intensity affects playbackRate and gain
    src.playbackRate.value = 1.0 + (intensity - 0.5) * 0.6;
    const g = audioCtx.createGain();
    g.gain.value = Math.min(1.2, 0.6 + intensity * 0.8);
    src.connect(g);
    g.connect(audioCtx.destination);
    src.start(now);
    // cleanup
    setTimeout(() => {
      try { src.disconnect(); g.disconnect(); } catch (e) {}
    }, (kickBuffer.duration / src.playbackRate.value + 0.2) * 1000);
  } else {
    // fallback
    try {
      const a = new Audio(kickUrl);
      a.playbackRate = 1.0 + (intensity - 0.5) * 0.6;
      a.volume = Math.min(1.0, 0.6 + intensity * 0.8);
      a.play().catch(()=>{/*ignore autoplay failure*/});
    } catch (e) {}
  }
}

// start a looping kick from loaded kickBuffer (falls back to one-shot if missing)
function startLeftLoop(intensity = 1.0) {
  ensureAudioCtx();
  if (!kickBuffer) {
    // fallback: play one-shot if buffer not available
    playKick(intensity);
    return;
  }
  if (leftLoopOn) return;
  const now = audioCtx.currentTime;
  leftLoopGain = audioCtx.createGain();
  leftLoopGain.gain.value = Math.min(1.0, 0.6 + intensity * 0.8);

  leftLoopSource = audioCtx.createBufferSource();
  leftLoopSource.buffer = kickBuffer;
  leftLoopSource.loop = true;
  leftLoopSource.playbackRate.value = 1.0 + (intensity - 0.5) * 0.6;

  leftLoopSource.connect(leftLoopGain);
  leftLoopGain.connect(audioCtx.destination);

  leftLoopSource.start(now);
  leftLoopOn = true;
}

function stopLeftLoop() {
  if (!leftLoopOn) return;
  try {
    if (leftLoopSource) leftLoopSource.stop();
  } catch (e) {}
  try {
    if (leftLoopSource) leftLoopSource.disconnect();
    if (leftLoopGain) leftLoopGain.disconnect();
  } catch (e) {}
  leftLoopSource = null;
  leftLoopGain = null;
  leftLoopOn = false;
}

// NEW: single-loop clap state to avoid piling up multiple clap plays
let clapLoopOn = false;
let clapLoopSource = null;
let clapLoopGain = null;
let clapAudioEl = null; // fallback HTMLAudioElement that loops

// --- NEW: start/stop single looping clap (use decoded buffer if available, else HTMLAudio fallback) ---
function startClapLoop(intensity = 1.0) {
  ensureAudioCtx();
  if (clapLoopOn) return;
  // if we have a decoded buffer, use AudioBufferSourceNode with loop=true
  if (clapBuffer) {
    const now = audioCtx.currentTime;
    clapLoopGain = audioCtx.createGain();
    clapLoopGain.gain.value = Math.min(1.0, 0.25 + intensity * 0.9);

    clapLoopSource = audioCtx.createBufferSource();
    clapLoopSource.buffer = clapBuffer;
    clapLoopSource.loop = true;
    clapLoopSource.playbackRate.value = 1.0 + (intensity - 0.5) * 0.4;

    clapLoopSource.connect(clapLoopGain);
    clapLoopGain.connect(audioCtx.destination);

    clapLoopSource.start(now);
    clapLoopOn = true;
    flashClapVisual();
  } else {
    // fallback: single HTMLAudio element that loops (avoid creating multiple)
    try {
      if (!clapAudioEl) {
        clapAudioEl = new Audio(clapUrl);
        clapAudioEl.loop = true;
        clapAudioEl.volume = Math.min(1.0, 0.25 + intensity * 0.9);
        clapAudioEl.playbackRate = 1.0 + (intensity - 0.5) * 0.4;
      } else {
        clapAudioEl.loop = true;
        clapAudioEl.volume = Math.min(1.0, 0.25 + intensity * 0.9);
        clapAudioEl.playbackRate = 1.0 + (intensity - 0.5) * 0.4;
      }
      clapAudioEl.play().catch(()=>{/*ignore play failure*/});
      clapLoopOn = true;
      flashClapVisual();
    } catch (e) {
      console.warn('Failed to start clap audio element loop:', e);
    }
  }
}

function stopClapLoop() {
  // stop AudioBuffer loop if present
  if (clapLoopOn && clapLoopSource) {
    try {
      clapLoopSource.stop();
    } catch (e) {}
    try { clapLoopSource.disconnect(); } catch (e) {}
    try { clapLoopGain.disconnect(); } catch (e) {}
    clapLoopSource = null;
    clapLoopGain = null;
  }
  // stop HTMLAudio fallback if present
  if (clapAudioEl) {
    try {
      clapAudioEl.pause();
      clapAudioEl.currentTime = 0;
      clapAudioEl.loop = false;
    } catch (e) {}
  }
  clapLoopOn = false;
}

function setup() {
  // full window canvas
  createCanvas(windowWidth, windowHeight);
  // initialize MediaPipe
  setupFace();
  setupVideo();
  // preload audio samples (user gesture may still be required for playback)
  loadKick();
  loadClap();
  loadSynth();

  // create a button to start/stop live microphone (user gesture required)
  liveBtn = createButton('Start Live Mic');
  liveBtn.position(10, 10);
  liveBtn.mousePressed(toggleLiveMic);
}

function toggleLiveMic() {
  if (!liveMicOn) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
     if (audioCtx.state === 'suspended') audioCtx.resume();
      micStream = stream;
      micSource = audioCtx.createMediaStreamSource(stream);
      micDest = audioCtx.createMediaStreamDestination();
      // route mic into the destination stream (no direct connection to audioCtx.destination)
      micSource.connect(micDest);

      // load kick sample (user gesture context)
      loadKick();

      // create or reuse the audio element to play the destination stream
      if (audioEl) {
        audioEl.pause();
        audioEl.srcObject = null;
      }
      audioEl = new Audio();
      audioEl.srcObject = micDest.stream;
      audioEl.loop = true;
      audioEl.autoplay = true;
      audioEl.playbackRate = baseRate;
      // play() requires user gesture; toggleLiveMic is called by a button click so this should succeed
      audioEl.play().catch(e => {
        console.warn('Audio element play failed:', e);
      });

      liveMicOn = true;
      liveBtn.html('Stop Live Mic');
    }).catch(err => {
      console.error('Microphone access denied or error:', err);
    });
  } else {
    // stop and clean up
    // ensure any left-loop is stopped when mic is turned off
    stopLeftLoop();
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    if (micSource) {
      try { micSource.disconnect(); } catch(e) {}
      micSource = null;
    }
    micDest = null;
    liveMicOn = false;
    liveBtn.html('Start Live Mic');
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// helper to ensure AudioContext exists
function ensureAudioCtx() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// start recording a short snippet from micSource
function startSnippetRecording() {
  if (!micSource) return;
  if (isRecordingSnippet) return;
  ensureAudioCtx();

  snippetBuffers = [];
  snippetTargetSamples = Math.floor(snippetDurationSec * audioCtx.sampleRate);
  isRecordingSnippet = true;

  if (!recorderNode) {
    recorderNode = audioCtx.createScriptProcessor(4096, 1, 1);
    recorderNode.onaudioprocess = function(e) {
      if (!isRecordingSnippet) return;
      const input = e.inputBuffer.getChannelData(0);
      // copy chunk
      snippetBuffers.push(new Float32Array(input));
      // check if we have enough samples
      let total = 0;
      for (let i = 0; i < snippetBuffers.length; i++) total += snippetBuffers[i].length;
      if (total >= snippetTargetSamples) {
        // stop recording and schedule playback
        stopSnippetRecording();
      }
    };
  }

  // connect recorder so onaudioprocess runs; connecting to destination is safe
  micSource.connect(recorderNode);
  // ScriptProcessor must be connected to destination in some browsers to run
  recorderNode.connect(audioCtx.destination);
}

// stop recording, assemble buffer and play triad
function stopSnippetRecording() {
  if (!isRecordingSnippet) return;
  isRecordingSnippet = false;

  // disconnect recorder
  try {
    if (recorderNode && micSource) micSource.disconnect(recorderNode);
  } catch (e) {}

  // assemble Float32Array of exact target length
  const sampleRate = audioCtx.sampleRate;
  const totalSamples = snippetTargetSamples;
  const outBuffer = new Float32Array(totalSamples);
  let offset = 0;
  for (let i = 0; i < snippetBuffers.length && offset < totalSamples; i++) {
    const chunk = snippetBuffers[i];
    const copyLen = Math.min(chunk.length, totalSamples - offset);
    outBuffer.set(chunk.subarray(0, copyLen), offset);
    offset += copyLen;
  }

  // create AudioBuffer and copy data
  const audioBuf = audioCtx.createBuffer(1, totalSamples, sampleRate);
  audioBuf.copyToChannel(outBuffer, 0, 0);

  // play three pitched versions (root, major third, fifth)
  const now = audioCtx.currentTime;
  const baseDuration = audioBuf.length / audioBuf.sampleRate;

  // frequency ratio for major third and fifth
  const ratioThird = Math.pow(2, 4 / 12);   // ~1.26
  const ratioFifth = Math.pow(2, 7 / 12);   // ~1.498

  const rates = [1.0, ratioThird, ratioFifth];

  // create and start buffer sources
  const nodes = [];
  for (let i = 0; i < 3; i++) {
    const src = audioCtx.createBufferSource();
    src.buffer = audioBuf;
    src.playbackRate.value = rates[i];

    // per-voice gain
    const g = audioCtx.createGain();
    g.gain.value = triadGains[i];

    // optional light filtering to blend
    const f = audioCtx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 800 + i * 200;
    f.Q.value = 1.2;

    src.connect(g);
    g.connect(f);
    f.connect(audioCtx.destination);

    src.start(now);
    const stopAt = now + (baseDuration / rates[i]) + 0.02;
    src.stop(stopAt);

    nodes.push({ src, g, f, stopAt });
  }

  // cleanup after playback
  setTimeout(() => {
    nodes.forEach(n => {
      try {
        n.src.disconnect();
        n.g.disconnect();
        n.f.disconnect();
      } catch (e) {}
    });
  }, (baseDuration / 1.0 + 0.5) * 1000);

  // reset snippetBuffers
  snippetBuffers = [];
}

function draw() {

  // get detected faces
  let faces = getFaceLandmarks();

  // see blendshape.txt for full list of possible blendshapes
  // use canonical mapping: leftEyeBlink comes from eyeBlinkLeft, rightEyeBlink from eyeBlinkRight
  leftEyeBlink = getBlendshapeScore('eyeBlinkLeft');
  let rightEyeBlink = getBlendshapeScore('eyeBlinkRight');

  // draw video full canvas (removed left color/status panel)
  if (isVideoReady()) {
    push();
    if (mirrorVideo) {
      translate(width, 0);
      scale(-1, 1);
    }
    image(videoElement, 0, 0, width, height);
    pop();
  } else {
    push();
    fill(60);
    rect(0, 0, width, height);
    pop();
  }

  // compute blink amount (1 = fully closed)
  let blinkAmount = constrain(1 - leftEyeBlink, 0, 1);

  // detect edge: open -> closed and toggle looping kick
  const nowMs = Date.now();
  if (prevLeftEyeBlinkScore >= 0.5 && leftEyeBlink < 0.5 && (nowMs - lastBlinkAt) > blinkCooldown) {
    // toggle loop on blink: start if off, stop if on
    if (leftLoopOn) {
      stopLeftLoop();
    } else {
      startLeftLoop(blinkAmount);
    }
    lastBlinkAt = nowMs;
  }
  prevLeftEyeBlinkScore = leftEyeBlink;

  // detect right-eye edge: open -> closed and toggle clap loop (single instance)
  if (prevRightEyeBlinkScore >= 0.5 && rightEyeBlink < 0.5 && (nowMs - lastBlinkAt) > blinkCooldown) {
    let rightBlinkAmount = constrain(1 - rightEyeBlink, 0, 1);
    try {
      ensureAudioCtx();
      // resume if suspended then ensure sample loaded, then toggle loop
      const prepareAndToggle = async () => {
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        await loadClap().catch(()=>{/*ignore load error*/});
        if (clapLoopOn) {
          stopClapLoop();
        } else {
          startClapLoop(rightBlinkAmount);
        }
      };
      // call but don't await
      prepareAndToggle().catch(e => {
        console.warn('Could not prepare/toggle clap loop:', e);
        // fallback attempt to toggle immediately
        if (clapLoopOn) stopClapLoop(); else startClapLoop(rightBlinkAmount);
      });
    } catch (e) {
      console.warn('Sync error toggling clap loop:', e);
      if (clapLoopOn) stopClapLoop(); else startClapLoop(rightBlinkAmount);
    }
    lastBlinkAt = nowMs;
  }
  prevRightEyeBlinkScore = rightEyeBlink;

  // helper: read a point safely from various mesh formats
  function readPoint(mesh, idx) {
    if (!mesh) return null;
    let p = mesh[idx];
    if (!p) return null;
    if (Array.isArray(p)) return { x: p[0], y: p[1] };
    if (p.x !== undefined && p.y !== undefined) return { x: p.x, y: p.y };
    return null;
  }

  // compute eye center from typical MediaPipe indices, mapping into full-canvas coords
  function eyeCenterFromFace(face, indices) {
    let mesh = face && (face.scaledMesh || face.mesh || face);
    if (!mesh) return null;
    let sumx = 0, sumy = 0, count = 0;
    for (let i = 0; i < indices.length; i++) {
      let pt = readPoint(mesh, indices[i]);
      if (pt) {
        let px = pt.x, py = pt.y;
        // convert normalized coords (0..1) to canvas pixels if necessary
        if (px >= 0 && px <= 1 && py >= 0 && py <= 1) {
          // map normalized x to canvas and flip when video is mirrored
          px = mirrorVideo ? (1 - px) * width : px * width;
          py *= height;
        }
        sumx += px; sumy += py; count++;
      }
    }
    if (count === 0) return null;
    return { x: sumx / count, y: sumy / count };
  }

  // compute eye center indices (screen-left uses mesh-right indices)
  const leftEyeIdx = rightEyeIdx; // top-level rightEyeIdx contains mesh-right indices

  let leftCenter = null;
  if (faces && faces.length > 0) {
    leftCenter = eyeCenterFromFace(faces[0], leftEyeIdx);
  }

  // draw square blob on left eye only (no fill, stroked outline)
  push();
  noFill();
  stroke(squareColor[0], squareColor[1], squareColor[2], squareColor[3]);
  strokeWeight(1);
  rectMode(CENTER);

  // left eye square size (smoothed)
  let targetLeft = squareMaxSize * blinkAmount;
  prevLeftSquare = lerp(prevLeftSquare, targetLeft, 0.25);
  if (leftCenter && prevLeftSquare > 1) {
    rect(leftCenter.x, leftCenter.y + 2 * blinkAmount, prevLeftSquare, prevLeftSquare);

    // kept small label above blob (optional) — remove if not wanted
    push();
    noStroke();
    // use same color as blobs for labels
    fill(squareColor[0], squareColor[1], squareColor[2]);
    textSize(10);
    textAlign(CENTER, BOTTOM);
    text('Left eye blinks', leftCenter.x, leftCenter.y - prevLeftSquare / 2 - 6);
    pop();
  }

  pop();

  // draw clap visual flash if active
  if (clapFlashUntil > millis()) {
    // clap visual removed (no yellow box)
    // intentionally empty: clap indicator removed
  }
  // --- ADD RIGHT EYE DRAWING ---
  // compute eye center indices for screen-right using mesh-left indices
  const rightEyeIdxLocal = [33, 133, 159, 145]; // mesh-left indices used for screen-right

  let rightCenter = null;
  if (faces && faces.length > 0) {
    rightCenter = eyeCenterFromFace(faces[0], rightEyeIdxLocal);
  }

  // draw square blob on right eye only (no fill, stroked outline)
  push();
  noFill();
  stroke(squareColor[0], squareColor[1], squareColor[2], squareColor[3]);
  strokeWeight(1);
  rectMode(CENTER);

  // right eye square size (smoothed)
  let targetRight = squareMaxSize * blinkAmount;
  prevRightSquare = lerp(prevRightSquare, targetRight, 0.25);
  if (rightCenter && prevRightSquare > 1) {
    rect(rightCenter.x, rightCenter.y + 2 * blinkAmount, prevRightSquare, prevRightSquare);

    // kept small label above blob (optional) — remove if not wanted
    push();
    noStroke();
    fill(squareColor[0], squareColor[1], squareColor[2]);
    textSize(10);
    textAlign(CENTER, BOTTOM);
    text('Right eye blinks', rightCenter.x, rightCenter.y - prevRightSquare / 2 - 6);
    pop();
  }

  pop();

  // --- ADD MOUTH BLOB DRAWING ---
  try {
    // measure mouth from outer lip ring (video-space pixels) and map to canvas-space
    const rings = (typeof getMouthRings === 'function') ? getMouthRings(0, true) : null;
    let targetSize = 0;
    let cxCanvas = prevMouthX || width / 2;
    let cyCanvas = prevMouthY || height / 2;

    if (rings && rings.length && videoElement && videoElement.width && videoElement.height) {
      const outer = rings[0];
      let minVx = Infinity, maxVx = -Infinity, minVy = Infinity, maxVy = -Infinity;
      for (const p of outer) {
        if (p.x < minVx) minVx = p.x;
        if (p.x > maxVx) maxVx = p.x;
        if (p.y < minVy) minVy = p.y;
        if (p.y > maxVy) maxVy = p.y;
      }
      if (isFinite(minVx) && isFinite(maxVx)) {
        const mouthVw = Math.max(0, maxVx - minVx);
        const mouthVh = Math.max(0, maxVy - minVy);
        // video->canvas scale
        const sx = width / videoElement.width;
        const sy = height / videoElement.height;
        // center in video pixels
        const centerVx = (minVx + maxVx) / 2;
        const centerVy = (minVy + maxVy) / 2;
        // map to canvas and apply mirror if needed (mirrorVideo = true mirrors horizontally)
        cxCanvas = mirrorVideo ? (width - centerVx * sx) : (centerVx * sx);
        cyCanvas = centerVy * sy;
        // compute size in canvas pixels
        targetSize = constrain(Math.max(mouthVw * sx, mouthVh * sy) * 1.1, 0, mouthMaxSize);
      }
    }

    // smooth position and size
    prevMouthSize = lerp(prevMouthSize, targetSize, 0.25);
    prevMouthX = lerp(prevMouthX || cxCanvas, cxCanvas, 0.25);
    prevMouthY = lerp(prevMouthY || cyCanvas, cyCanvas, 0.25);

    // --- NEW: detect mouth openness and toggle synth ---
    try {
      const nowMs = Date.now();
      const mouthOpenScore = (typeof getMouthOpenness === 'function') ? getMouthOpenness(0) : 0;
      const open = mouthOpenScore > 0.06; // adjust threshold if needed
      // rising-edge only: closed -> open toggles synth; closing does nothing
      if (open && !prevMouthOpen && (nowMs - lastMouthAt) > mouthCooldown) {
        if (synthLoopOn) stopSynthLoop(); else startSynthLoop();
        lastMouthAt = nowMs;
      }
      prevMouthOpen = open;
    } catch (e) {
      // ignore if opacity helper not present
    }

    if (prevMouthSize > 1) {
      push();
      // draw mouth as outline only (square), using the same green color as eyes/labels
      noFill();
      stroke(squareColor[0], squareColor[1], squareColor[2], squareColor[3]);
      strokeWeight(1);
      rectMode(CENTER);
      // draw centered square (use prevMouthSize for both width and height)
      rect(prevMouthX, prevMouthY, prevMouthSize, prevMouthSize);

      // draw label above mouth: "mouth open" or "mouth close"
      push();
      noStroke();
      fill(squareColor[0], squareColor[1], squareColor[2]); // same green
      textSize(12);
      textAlign(CENTER, BOTTOM);
      const label = (prevMouthOpen) ? 'mouth open' : 'mouth close';
      const labelY = prevMouthY - (prevMouthSize / 2) - 5;
      text(label, prevMouthX, labelY);
      pop();

      pop();
    } else {
      prevMouthSize = lerp(prevMouthSize, 0, 0.15);
    }
  } catch (e) {
    // ignore if MediaPipe mouth helpers are unavailable
  }

}