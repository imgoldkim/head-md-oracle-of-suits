function setup() {

  // full window canvas
  createCanvas(windowWidth, windowHeight);

  // persistent drawing layer (separate graphics buffer)
  drawingLayer = createGraphics(windowWidth, windowHeight);
  drawingLayer.clear();

  // per-hand drawing state
  handDrawingState = {}; // keys by hand index: {drawing:boolean, lastX, lastY, color}

  // initialize MediaPipe settings
  setupHands();
  // start camera using MediaPipeHands.js helper
  setupVideo();

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // resize drawing layer to match
  if (drawingLayer) {
    let newLayer = createGraphics(windowWidth, windowHeight);
    newLayer.image(drawingLayer, 0, 0);
    drawingLayer = newLayer;
  }
}


function draw() {
  // clear the canvas
  background(225);

  // if the video connection is ready, draw the camera first (scaled to canvas)
  if (isVideoReady()) {
    // draw video scaled to the full canvas so landmarks map to canvas coords
    image(videoElement, 0, 0, width, height);
  }

  // draw the persistent drawing layer on top of the camera feed
  image(drawingLayer, 0, 0);

  // use thicker lines for drawing hand connections
  strokeWeight(2);

  // make sure we have detections to draw
  // detect whether two index fingertips are visible
  let twoIndicesDetected = false;
  if (detections && detections.multiHandLandmarks) {
    let count = 0;
    for (let hand of detections.multiHandLandmarks) {
      if (hand[8]) count++;
    }
    twoIndicesDetected = (count >= 2);
  }

  // render indicator
  if (twoIndicesDetected) {
    push();
    noStroke();
    fill(255, 255, 255, 200);
    rect(10, 10, 180, 28, 6);
    fill(0);
    textSize(14);
    text('Two index fingers detected', 18, 30);
    pop();
  }

  if (detections) {

    // for each detected hand (use index so we can track per-hand state)
    for (let hi = 0; hi < detections.multiHandLandmarks.length; hi++) {
      let hand = detections.multiHandLandmarks[hi];
  // draw the index finger
  drawIndex(hand, hi);
      // draw the thumb finger
      drawThumb(hand);
      // draw fingertip points
      drawTips(hand, hi);
      // draw connections
      drawConnections(hand);
      // draw all landmarks
      drawLandmarks(hand);

      // handle index-only drawing for this hand
      handleIndexDrawing(hi, hand);
    } // end of hands loop

  } // end of if detections

  // detect double pair-tap (two quick touches between two index fingertips)
  // detect thumb-index taps per hand to toggle drawing
  handleThumbIndexToggles(detections);

  // detect index-middle taps to cycle color
  handleIndexMiddleToggles(detections);

  // detect double pair-tap (two quick touches between two index fingertips)
  handlePairDoubleTap(detections);

  // draw pause indicator
  drawPauseIndicator();
  // draw color palette bottom-right
  drawPalette();
  
} // end of draw


// only the index finger tip landmark
function drawIndex(landmarks, handIndex) {

  // get the index fingertip landmark
  let mark = landmarks[FINGER_TIPS.index];

  noStroke();
  // set fill color for index fingertip
  fill(255); // white marker

  // adapt the coordinates (0..1) to video coordinates
  let x = mark.x * width;
  let y = mark.y * height;
  circle(x, y, 14);

  // small translucent halo to make it visible on varied backgrounds
  fill(255, 255, 255, 60);
  circle(x, y, 30);

  // show enabled drawing state if present
  let state = handDrawingState[handIndex] || { enabled: false };
  if (state.enabled) {
    noFill();
    stroke(0, 200, 80);
    strokeWeight(3);
    circle(x, y, 44);
    noStroke();
  }

  // show per-hand color swatch near the fingertip if color is set
  if (state.color) {
    push();
    noStroke();
    let sw = 14;
    // place to the top-right of the fingertip
    let sx = x + 22;
    let sy = y - 22;
    fill(state.color);
    rect(sx, sy, sw, sw, 4);
    // draw ON/OFF label next to swatch
    fill(state.enabled ? 'rgba(0,200,80,1)' : 'rgba(200,0,0,1)');
    textSize(10);
    textAlign(LEFT, CENTER);
    let label = state.enabled ? 'ON' : 'OFF';
    fill(255);
    // small background for label
    noStroke();
    fill(state.enabled ? 'rgba(0,200,80,0.9)' : 'rgba(200,0,0,0.9)');
    rect(sx + sw + 6, sy, 30, sw, 4);
    fill(255);
    text(label, sx + sw + 11, sy + sw / 2);
    pop();
  }

}


// draw the thumb finger tip landmark
function drawThumb(landmarks) {

  // get the thumb fingertip landmark
  let mark = landmarks[FINGER_TIPS.thumb];

  noStroke();
  // set fill color for thumb fingertip
  fill(255, 255, 0);

  // adapt the coordinates (0..1) to video coordinates
  let x = mark.x * width;
  let y = mark.y * height;
  circle(x, y, 20);

}

function drawTips(landmarks) {

  noStroke();
  // set fill color for fingertips
  fill(0, 0, 255);

  // fingertip indices
  const tips = [4, 8, 12, 16, 20];

  for (let tipIndex of tips) {
    let mark = landmarks[tipIndex];
  // adapt the coordinates (0..1) to canvas coordinates
  let x = mark.x * width;
  let y = mark.y * height;
    circle(x, y, 10);
  }

}


function drawLandmarks(landmarks) {

  noStroke();
  // set fill color for landmarks
  fill(255, 0, 0);

  for (let mark of landmarks) {
  // adapt the coordinates (0..1) to canvas coordinates
  let x = mark.x * width;
  let y = mark.y * height;
    circle(x, y, 6);
  }

}


function drawConnections(landmarks) {

  // set stroke color for connections
  stroke(0, 255, 0);

  // iterate through each connection
  for (let connection of HAND_CONNECTIONS) {
    // get the two landmarks to connect
    const a = landmarks[connection[0]];
    const b = landmarks[connection[1]];
    // skip if either landmark is missing
    if (!a || !b) continue;
    // landmarks are normalized [0..1], (x,y) with origin top-left
    let ax = a.x * width;
    let ay = a.y * height;
    let bx = b.x * width;
    let by = b.y * height;
    line(ax, ay, bx, by);
  }

}

// ----------------- drawing helpers -----------------

// persistent drawing buffer and per-hand state
let drawingLayer;
let handDrawingState = {};

// global pause for drawing (toggled by double pair-tap)
let globalPause = false;

// state for detecting pair taps between two index fingertips
let pairTapState = {
  lastTouchTime: 0,
  lastTouchCount: 0,
  tapTimeout: 600 // ms window for double tap
};

// per-hand tap state for thumb-index toggles
let thumbIndexTapState = {};

// per-hand tap state for index-middle color toggles
let indexMiddleTapState = {};

// pastel palette to cycle when index taps middle
const INDEX_MIDDLE_PALETTE = [
  '#FFFFFF', // white
  '#FFDDEE', // pastel pink
  '#E8D6FF', // pastel lavender
  '#D6EEFF', // pastel baby blue
  '#DFF7E0', // pastel mint
  '#FFF7D6', // pastel lemon
  '#FFE8D2', // pastel peach
  '#FDE2F3', // pastel rose
  '#EAF3FF'  // pastel sky
];

// per-hand tap state for thumb-index toggles (track contact and toggle on release)
function handleThumbIndexToggles(detections) {
  if (!detections || !detections.multiHandLandmarks) return;
  const TOUCH_DIST = 30; // px threshold for thumb-index contact
  const DEBOUNCE_MS = 400; // ms after a toggle before allowing another

  for (let hi = 0; hi < detections.multiHandLandmarks.length; hi++) {
    let hand = detections.multiHandLandmarks[hi];
    let thumb = hand[4];
    let index = hand[8];
    if (!thumb || !index) continue;
    let tx = thumb.x * width;
    let ty = thumb.y * height;
    let ix = index.x * width;
    let iy = index.y * height;
    let d = dist(tx, ty, ix, iy);
    let now = millis();

    let state = thumbIndexTapState[hi] || { inContact: false, contactStart: 0, lastToggle: 0 };

    if (d < TOUCH_DIST) {
      // contact started or continuing
      if (!state.inContact) {
        state.inContact = true;
        state.contactStart = now;
      }
    } else {
      // contact ended (release)
      if (state.inContact) {
        // only toggle if enough time passed since last toggle
        if (now - state.lastToggle > DEBOUNCE_MS) {
          // interpret as a tap if contact was brief (not a long hold)
          let contactDuration = now - state.contactStart;
          const MAX_TAP_DURATION = 1200; // ms
          if (contactDuration <= MAX_TAP_DURATION) {
            // toggle hand drawing state
            let h = handDrawingState[hi] || { lastX: null, lastY: null, smoothX: null, smoothY: null, enabled: false };
            h.enabled = !h.enabled;
            if (h.enabled) {
              h.smoothX = ix;
              h.smoothY = iy;
              h.lastX = ix;
              h.lastY = iy;
            } else {
              h.lastX = null;
              h.lastY = null;
            }
            handDrawingState[hi] = h;
            state.lastToggle = now;
          }
        }
      }
      state.inContact = false;
      state.contactStart = 0;
    }

    thumbIndexTapState[hi] = state;
  }
}

// draw using only the index fingertip: white strokes follow index movements
function handleIndexDrawing(handIndex, landmarks) {
  const index = landmarks[8];
  if (!index) return;

  // map normalized landmark (0..1) to canvas coordinates
  let ix = index.x * width;
  let iy = index.y * height;
  let state = handDrawingState[handIndex] || { lastX: null, lastY: null, smoothX: null, smoothY: null, enabled: false };

  // if drawing is not enabled for this hand, reset last positions and skip drawing
  if (!state.enabled) {
    state.lastX = null;
    state.lastY = null;
    handDrawingState[handIndex] = state;
    return;
  }

  // respect global pause
  if (globalPause) {
    return;
  }

  // smoothing factor (0..1) higher = smoother (lag), lower = more responsive
  const SMOOTH_ALPHA = 0.25;
  // movement threshold to avoid tiny jitter strokes
  const MOVE_THRESHOLD = 1.5;

  // initialize smoothed position if absent
  if (state.smoothX === null || state.smoothY === null) {
    state.smoothX = ix;
    state.smoothY = iy;
  }

  // lerp smoothed position towards raw index position
  state.smoothX = lerp(state.smoothX, ix, SMOOTH_ALPHA);
  state.smoothY = lerp(state.smoothY, iy, SMOOTH_ALPHA);

  if (state.lastX !== null && state.lastY !== null) {
    let dx = state.smoothX - state.lastX;
    let dy = state.smoothY - state.lastY;
    if (abs(dx) > MOVE_THRESHOLD || abs(dy) > MOVE_THRESHOLD) {
      // use hand color if present, else default to white
      let col = state.color || '#FFFFFF';
      drawingLayer.stroke(col);
      drawingLayer.strokeWeight(6);
      drawingLayer.strokeCap(ROUND);
      drawingLayer.line(state.lastX, state.lastY, state.smoothX, state.smoothY);
    }
  } else {
    // initial dot at smoothed position
    drawingLayer.noStroke();
    drawingLayer.fill(state.color || 255);
    drawingLayer.circle(state.smoothX, state.smoothY, 6);
  }

  state.lastX = state.smoothX;
  state.lastY = state.smoothY;
  handDrawingState[handIndex] = state;
}

// detect index-middle contact per hand and cycle brush color (debounced)
function handleIndexMiddleToggles(detections) {
  if (!detections || !detections.multiHandLandmarks) return;
  const TOUCH_DIST = 30; // px threshold
  const DEBOUNCE_MS = 400;

  for (let hi = 0; hi < detections.multiHandLandmarks.length; hi++) {
    let hand = detections.multiHandLandmarks[hi];
    let index = hand[8];
    let middle = hand[12];
    if (!index || !middle) continue;
    let ix = index.x * width;
    let iy = index.y * height;
    let mx = middle.x * width;
    let my = middle.y * height;
    let d = dist(ix, iy, mx, my);
    let now = millis();
    let state = indexMiddleTapState[hi] || { lastToggle: 0 };
    if (d < TOUCH_DIST && (now - state.lastToggle) > DEBOUNCE_MS) {
      // cycle color
      let h = handDrawingState[hi] || { color: INDEX_MIDDLE_PALETTE[0] };
      let cur = h.color || INDEX_MIDDLE_PALETTE[0];
      let idx = INDEX_MIDDLE_PALETTE.indexOf(cur);
      let next = (idx === -1) ? 1 : (idx + 1) % INDEX_MIDDLE_PALETTE.length;
      h.color = INDEX_MIDDLE_PALETTE[next];
      handDrawingState[hi] = h;
      state.lastToggle = now;
      indexMiddleTapState[hi] = state;
    }
  }
}

// Check for a double tap gesture: two quick touches between index fingertips of two different hands
function handlePairDoubleTap(detections) {
  if (!detections || !detections.multiHandLandmarks || detections.multiHandLandmarks.length < 2) return;

  // find indices for all hands
  let idxPositions = detections.multiHandLandmarks.map(h => h[8]).filter(Boolean);
  if (idxPositions.length < 2) return;

  // compute nearest pair distance
  let touched = false;
  for (let i = 0; i < idxPositions.length; i++) {
    for (let j = i + 1; j < idxPositions.length; j++) {
      let a = idxPositions[i];
      let b = idxPositions[j];
      let ax = a.x * width;
      let ay = a.y * height;
      let bx = b.x * width;
      let by = b.y * height;
      let d = dist(ax, ay, bx, by);
      if (d < 40) { // tapped threshold in pixels
        touched = true;
        break;
      }
    }
    if (touched) break;
  }

  let now = millis();
  if (touched) {
    // count consecutive touches within tapTimeout
    if (now - pairTapState.lastTouchTime < pairTapState.tapTimeout) {
      pairTapState.lastTouchCount += 1;
    } else {
      pairTapState.lastTouchCount = 1;
    }
    pairTapState.lastTouchTime = now;

    if (pairTapState.lastTouchCount >= 2) {
      // double tap detected — toggle global pause
      globalPause = !globalPause;
      // reset state to avoid triple toggles
      pairTapState.lastTouchCount = 0;
      pairTapState.lastTouchTime = 0;
    }
  }
}

// draw small global pause indicator
function drawPauseIndicator() {
  if (!globalPause) return;
  push();
  noStroke();
  fill(255, 100, 100, 220);
  rect(width/2 - 60, 10, 120, 28, 6);
  fill(255);
  textSize(14);
  textAlign(CENTER, CENTER);
  text('PAUSED', width/2, 24);
  pop();
}

// clear drawing with 'c' key
function keyPressed() {
  if (key === 'c' || key === 'C') {
    if (drawingLayer) drawingLayer.clear();
  }
}

// toggle drawing enable when clicking near an index fingertip; click elsewhere toggles first-hand
function mousePressed() {
  const TOGGLE_RADIUS = 60;
  // check palette click first
  if (handlePaletteClick(mouseX, mouseY)) return;
  if (!detections || !detections.multiHandLandmarks) return;

  // try to toggle a specific hand if click is near its index fingertip
  for (let hi = 0; hi < detections.multiHandLandmarks.length; hi++) {
    let hand = detections.multiHandLandmarks[hi];
    let idx = hand[8];
    if (!idx) continue;
    let ix = idx.x * width;
    let iy = idx.y * height;
    if (dist(mouseX, mouseY, ix, iy) <= TOGGLE_RADIUS) {
      let state = handDrawingState[hi] || { lastX: null, lastY: null, smoothX: null, smoothY: null, enabled: false };
      state.enabled = !state.enabled;
      if (state.enabled) {
        // initialize smoothing/last position to avoid jumps
        state.smoothX = ix;
        state.smoothY = iy;
        state.lastX = ix;
        state.lastY = iy;
      } else {
        state.lastX = null;
        state.lastY = null;
      }
      handDrawingState[hi] = state;
      return;
    }
  }

  // click not near any fingertip: toggle drawing on first detected hand (or clear all)
  let anyEnabled = false;
  for (let k in handDrawingState) if (handDrawingState[k] && handDrawingState[k].enabled) anyEnabled = true;
  if (anyEnabled) {
    for (let k in handDrawingState) if (handDrawingState[k]) handDrawingState[k].enabled = false;
  } else if (detections.multiHandLandmarks.length > 0) {
    // enable first hand
    let hi = 0;
    let idx = detections.multiHandLandmarks[hi][8];
    let ix = idx ? idx.x * width : width / 2;
    let iy = idx ? idx.y * height : height / 2;
    handDrawingState[hi] = handDrawingState[hi] || { lastX: null, lastY: null, smoothX: null, smoothY: null, enabled: false };
    handDrawingState[hi].enabled = true;
    handDrawingState[hi].smoothX = ix;
    handDrawingState[hi].smoothY = iy;
    handDrawingState[hi].lastX = ix;
    handDrawingState[hi].lastY = iy;
  }
}

// draw a clickable color palette in the bottom-right corner
function drawPalette() {
  const sw = 28; // swatch size
  const gap = 8;
  const cols = 4;
  const palette = INDEX_MIDDLE_PALETTE;
  let rows = Math.ceil(palette.length / cols);
  let w = cols * sw + (cols - 1) * gap;
  let h = rows * sw + (rows - 1) * gap;
  let x0 = width - w - 16;
  let y0 = height - h - 16;

  push();
  noStroke();
  fill(0, 0, 0, 120);
  rect(x0 - 8, y0 - 8, w + 16, h + 16, 8);

  for (let i = 0; i < palette.length; i++) {
    let cx = x0 + (i % cols) * (sw + gap);
    let cy = y0 + Math.floor(i / cols) * (sw + gap);
    fill(palette[i]);
    rect(cx, cy, sw, sw, 6);
  }
  // draw current color swatch to the right of palette
  let currentColor = '#FFFFFF';
  // prefer color of first enabled hand
  for (let k in handDrawingState) {
    if (handDrawingState[k] && handDrawingState[k].enabled && handDrawingState[k].color) {
      currentColor = handDrawingState[k].color;
      break;
    }
  }
  // fallback to hand 0 color
  if (!currentColor && handDrawingState[0] && handDrawingState[0].color) currentColor = handDrawingState[0].color;

  let swX = x0 + w + 16;
  let swY = y0 + Math.floor(rows * sw / 2) - sw / 2;
  // swatch background
  fill(0,0,0,120);
  rect(swX - 8, y0 - 8, sw + 16, h + 16, 8);
  // label
  fill(255);
  textSize(12);
  textAlign(LEFT, TOP);
  text('Current', swX + sw + 12, y0 + 4);
  // color box
  fill(currentColor);
  rect(swX, swY, sw, sw, 6);
  pop();
}

// handle clicks on the palette; return true if click was on a swatch
function handlePaletteClick(mx, my) {
  const sw = 28;
  const gap = 8;
  const cols = 4;
  const palette = INDEX_MIDDLE_PALETTE;
  let rows = Math.ceil(palette.length / cols);
  let w = cols * sw + (cols - 1) * gap;
  let h = rows * sw + (rows - 1) * gap;
  let x0 = width - w - 16;
  let y0 = height - h - 16;

  for (let i = 0; i < palette.length; i++) {
    let cx = x0 + (i % cols) * (sw + gap);
    let cy = y0 + Math.floor(i / cols) * (sw + gap);
    if (mx >= cx && mx <= cx + sw && my >= cy && my <= cy + sw) {
      // apply this color to enabled hands; if none enabled, apply to first hand
      let applied = false;
      for (let k in handDrawingState) {
        if (handDrawingState[k] && handDrawingState[k].enabled) {
          handDrawingState[k].color = palette[i];
          applied = true;
        }
      }
      if (!applied) {
        // ensure at least one hand state exists
        if (!handDrawingState[0]) handDrawingState[0] = { lastX: null, lastY: null, smoothX: null, smoothY: null, enabled: false };
        handDrawingState[0].color = palette[i];
      }
      return true;
    }
  }
  return false;
}
