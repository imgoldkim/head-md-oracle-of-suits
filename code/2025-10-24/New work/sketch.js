// Sound objects
let bassSound;
let kickSound;
let hihatSound;
let snareSound;
let synthSound;
let effectSound;

// toggle states and debouncing
let prevIndexOnly = false;
let bassOn = false;
let lastToggleTime = 0;

let prevTwoUp = false;
let kickOn = false;
let lastTwoToggleTime = 0;

let prevPeach = false;
let hihatOn = false;
let lastPeachToggleTime = 0;

let prevThreeUp = false;
let synthOn = false;
let lastThreeToggleTime = 0;

let prevFourUp = false;
let snareOn = false;
let lastFourToggleTime = 0;
// fist (effect) toggle state (right-hand fist disabled)
let prevFist = false;
let effectOn = false;
let lastFistToggleTime = 0;
// left-fist (hihat2) toggle state
let prevLeftFist = false;
let leftHihatOn = false;
let lastLeftFistToggleTime = 0;
// right-hand pinky+ring toggle state (new hihat mapping)
let prevRightPinkyRing = false;
let lastRightPinkyRingToggleTime = 0;
// left-pinky LP toggle state
let prevLeftPinky = false;
let lpOn = false;
let lastLeftPinkyToggleTime = 0;
// left-peach (effect) toggle state
let prevLeftPeach = false;
let leftEffectOn = false;
let lastLeftPeachToggleTime = 0;
// open-palm (master) toggle state
let prevOpenPalm = false;
let allOn = false;
let lastOpenToggleTime = 0;

// require holding an open palm for a short time before triggering master stop
let openPalmStart = 0;
const OPEN_PALM_HOLD = 500; // ms hold required to trigger master STOP

const TOGGLE_COOLDOWN = 400; // ms to debounce toggles

// high-pass filter and slider (left-pinky control)
let hpFilter = null;
let sliderX, sliderY, sliderW, sliderH;
let sliderVal = 0.0; // 0..1
const HP_MIN_FREQ = 20;    // Hz
const HP_MAX_FREQ = 12000; // Hz
let sliderActive = false; // true while left pinky controls it
// low-pass filter and slider (left-pinky control)
let lpFilter = null;
let slider2X, slider2Y, slider2W, slider2H;
let slider2Val = 0.0; // 0..1
const LP_MIN_FREQ = 40;    // Hz
const LP_MAX_FREQ = 12000; // Hz
let slider2Active = false;

// per-hand lower-then-raise detection state (keyed by hand index)
let handWasDown = {};
let lastHandRaiseTimeByHand = {};
const HAND_DOWN_RATIO = 0.82; // when hand centroid y > ratio*H considered 'down'
const HAND_UP_RATIO = 0.60;   // when centroid y < ratio*H considered 'up'
const HAND_RAISE_COOLDOWN = 600; // ms debounce for raise-trigger

function preload() {
  // load Bass.wav from project root (place Bass.wav next to index.html / sketch.js)
  bassSound = loadSound('Bass.wav', () => {
    console.log('Bass.wav loaded');
    if (hpFilter && bassSound.isLoaded()) { try { bassSound.disconnect(); bassSound.connect(hpFilter); } catch(e){} }
  }, (err) => {
    console.warn('Failed to load Bass.wav', err);
  });
  // load kick.wav for two-fingers toggle
  kickSound = loadSound('kick.wav', () => {
    console.log('kick.wav loaded');
    if (hpFilter && kickSound.isLoaded()) { try { kickSound.disconnect(); kickSound.connect(hpFilter); } catch(e){} }
  }, (err) => {
    console.warn('Failed to load kick.wav', err);
  });
  // load snare and synth for three/four-fingers toggles
  snareSound = loadSound('snare.wav', () => { console.log('snare.wav loaded'); if (hpFilter && snareSound.isLoaded()) { try { snareSound.disconnect(); snareSound.connect(hpFilter); } catch(e){} } }, (err) => { console.warn('Failed to load snare.wav', err); });
  synthSound = loadSound('synth.wav', () => { console.log('synth.wav loaded'); if (hpFilter && synthSound.isLoaded()) { try { synthSound.disconnect(); synthSound.connect(hpFilter); } catch(e){} } }, (err) => { console.warn('Failed to load synth.wav', err); });
  // try loading hihat; accept either 'hihat 2.wav' or 'hihat.wav' in the folder
  hihatSound = null;
  loadSound('hihat 2.wav', (s) => { hihatSound = s; console.log('hihat 2.wav loaded'); if (hpFilter && hihatSound.isLoaded()) { try { hihatSound.disconnect(); hihatSound.connect(hpFilter); } catch(e){} } }, (err) => {
    console.warn('hihat 2.wav not found, trying hihat.wav', err);
    loadSound('hihat.wav', (s2) => { hihatSound = s2; console.log('hihat.wav loaded'); if (hpFilter && hihatSound.isLoaded()) { try { hihatSound.disconnect(); hihatSound.connect(hpFilter); } catch(e){} } }, (err2) => { console.warn('Failed to load hihat.wav', err2); });
  });
  // load effect for fist toggle
  effectSound = loadSound('effect.wav', () => { console.log('effect.wav loaded'); }, (err) => { console.warn('Failed to load effect.wav', err); });
}

function setup() {

  // full window canvas
  createCanvas(windowWidth, windowHeight);

  // (Audio enable button removed) -- browser audio must be enabled via a user gesture elsewhere if needed

  // initialize MediaPipe settings
  setupHands();
  // start camera using MediaPipeHands.js helper
  setupVideo();

  // initialize smoothed box to zeros (will snap to first detected target)
  boxSmoothed = { cx: 0, cy: 0, size: 0 };

  // create filters and slider layout
  hpFilter = new p5.HighPass();
  hpFilter.freq(HP_MIN_FREQ);
  hpFilter.res(0.7);
  lpFilter = new p5.LowPass();
  lpFilter.freq(LP_MAX_FREQ);
  lpFilter.res(0.7);
  // chain hp -> lp
  try { hpFilter.connect(lpFilter); } catch (e) {}

  // bottom sliders layout
  sliderW = 80;
  sliderH = min(160, floor(height * 0.18));
  const gap = 40;
  const totalW = sliderW * 2 + gap;
  const startX = (width - totalW) / 2;
  sliderX = startX;
  sliderY = height - sliderH - 20;
  slider2X = startX + sliderW + gap;
  slider2Y = sliderY;
  slider2W = sliderW;
  slider2H = sliderH;
  sliderVal = 0.0;
  slider2Val = 1.0;

  // connect any already-loaded sounds to the hpFilter (which flows into lpFilter)
  const connectIfLoaded = (s) => { if (s && typeof s.isLoaded === 'function' && s.isLoaded()) { try { s.disconnect(); s.connect(hpFilter); } catch(e) {} } };
  connectIfLoaded(bassSound);
  connectIfLoaded(kickSound);
  connectIfLoaded(hihatSound);
  connectIfLoaded(snareSound);
  connectIfLoaded(synthSound);
  connectIfLoaded(effectSound);

}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}


function draw() {
  // clear the canvas
  background(255);

  // if the video connection is ready
  if (isVideoReady()) {
    // draw the capture image
    image(videoElement, 0, 0);
  }

  // use thicker lines for drawing hand connections
  strokeWeight(2);

  // make sure we have detections to draw
  if (detections) {

  // detect if any hand is "index up" (index extended and middle/ring/pinky NOT extended)
  let anyIndexOnly = false;
  // detect if right-hand has pinky+ring extended together (new hihat mapping)
  let anyRightPinkyRing = false;
  // detect if any hand has two fingers up (index + middle, ring not)
  let anyTwoUp = false;
  // detect if any hand has peach/peace sign (thumb + index + middle, ring and pinky not)
  let anyPeach = false;
  // detect fist
  let anyFist = false;
  // detect left-hand peach (peace) sign
  let anyLeftPeach = false;
  // detect left-hand fist (for hihat toggle)
  let anyLeftFist = false;
  // detect if any hand has three fingers up (index+middle+ring, pinky not) or four fingers up
  let anyThreeUp = false;
  let anyFourUp = false;
  // detect open palm (all five fingers extended) for master toggle
  let anyOpenPalm = false;

    // for each detected hand: only react to the RIGHT hand
    for (let h = 0; h < detections.multiHandLandmarks.length; h++) {
      const hand = detections.multiHandLandmarks[h];
      // determine handedness (MediaPipe attaches multiHandedness aligned with landmarks)
      let isRightHand = false;
      if (detections.multiHandedness && detections.multiHandedness[h]) {
        const hh = detections.multiHandedness[h];
        // API shape varies; check common properties
        if (hh.label && hh.label.toLowerCase() === 'right') isRightHand = true;
        else if (hh.classification && hh.classification[0] && hh.classification[0].label && hh.classification[0].label.toLowerCase() === 'right') isRightHand = true;
      }
      // if this is NOT the right hand, use it only to detect a LEFT-hand open palm
      if (!isRightHand) {
        // compute finger extension for the left hand to detect open palm
        const itL = hand[8], ipL = hand[6];
        const mtL = hand[12], mpL = hand[10];
        const rtL = hand[16], rpL = hand[14];
        const ptL = hand[20], ppL = hand[18];
        const ttL = hand[4], tmL = hand[2];
        const HL = videoElement.height;
        const WL = videoElement.width;
        let indexExtendedL = false, middleExtendedL = false, ringExtendedL = false, pinkyExtendedL = false, thumbExtendedL = false;
        if (itL && ipL) indexExtendedL = (itL.y * HL) < (ipL.y * HL);
        if (mtL && mpL) middleExtendedL = (mtL.y * HL) < (mpL.y * HL);
        if (rtL && rpL) ringExtendedL = (rtL.y * HL) < (rpL.y * HL);
        if (ptL && ppL) pinkyExtendedL = (ptL.y * HL) < (ppL.y * HL);
        if (ttL && tmL) thumbExtendedL = Math.abs(ttL.x - tmL.x) > 0.06;
        // if the LEFT hand shows an open palm, trigger the master stop
        if (thumbExtendedL && indexExtendedL && middleExtendedL && ringExtendedL && pinkyExtendedL) anyOpenPalm = true;
  // detect left-hand fist: thumb extended, other fingers not extended
  if (thumbExtendedL && !indexExtendedL && !middleExtendedL && !ringExtendedL && !pinkyExtendedL) anyLeftFist = true;
  // detect left-hand peach/peace: thumb + index + middle, ring and pinky not extended
  if (thumbExtendedL && indexExtendedL && middleExtendedL && !ringExtendedL && !pinkyExtendedL) anyLeftPeach = true;

        // LEFT pinky: rising-edge toggle GROUP (hihat + kick + snare) on/off
        if (ptL) {
          const nowLP = millis();
          if (pinkyExtendedL && !prevLeftPinky && (nowLP - lastLeftPinkyToggleTime) > TOGGLE_COOLDOWN) {
            // toggle group play: hihat, kick, snare together
            const groupOn = !(kickOn || hihatOn || snareOn);
            lastLeftPinkyToggleTime = nowLP;
            console.log('left pinky -> group toggle, turning groupOn =', groupOn);
            if (groupOn) {
              // start all three
              if (hihatSound && typeof hihatSound.loop === 'function') { hihatSound.loop(); hihatOn = true; }
              if (kickSound && typeof kickSound.loop === 'function') { kickSound.loop(); kickOn = true; }
              if (snareSound && typeof snareSound.loop === 'function') { snareSound.loop(); snareOn = true; }
            } else {
              // stop all three
              if (hihatSound && typeof hihatSound.stop === 'function') { hihatSound.stop(); hihatOn = false; }
              if (kickSound && typeof kickSound.stop === 'function') { kickSound.stop(); kickOn = false; }
              if (snareSound && typeof snareSound.stop === 'function') { snareSound.stop(); snareOn = false; }
            }
          }
          // no continuous slider behavior for this gesture
          prevLeftPinky = pinkyExtendedL;
        }

        // still render visuals for the non-right hand
        drawLandmarks(hand);
        drawConnections(hand);
        drawHandBox(hand, h);
        continue;
      }

      // detect index-only before drawing (use same logic as drawHandBox)
      const it = hand[8], ip = hand[6];
      const mt = hand[12], mp = hand[10];
      const rt = hand[16], rp = hand[14];
      const pt = hand[20], pp = hand[18];
      const tt = hand[4], tm = hand[2];
      const H = videoElement.height;
      const W = videoElement.width;
      let indexExtended = false, middleExtended = false, ringExtended = false, pinkyExtended = false, thumbExtended = false;
      if (it && ip) indexExtended = (it.y * H) < (ip.y * H);
      if (mt && mp) middleExtended = (mt.y * H) < (mp.y * H);
      if (rt && rp) ringExtended = (rt.y * H) < (rp.y * H);
      if (pt && pp) pinkyExtended = (pt.y * H) < (pp.y * H);
      // thumb: horizontal displacement heuristic (normalized coords)
      if (tt && tm) thumbExtended = Math.abs(tt.x - tm.x) > 0.06;

      // --- lower-then-raise detection (per-hand) ---
      let centroidY = 0;
      for (let lm of hand) centroidY += (lm.y || 0);
      centroidY = (centroidY / hand.length) * H;
      const isDown = centroidY > (H * HAND_DOWN_RATIO);
      const isUp = centroidY < (H * HAND_UP_RATIO);
      const prevDown = !!handWasDown[h];
      const nowHand = millis();
      const lastRaise = lastHandRaiseTimeByHand[h] || 0;
      // if hand was down and now raised above threshold -> trigger based on finger pose
      if (prevDown && isUp && (nowHand - lastRaise) > HAND_RAISE_COOLDOWN) {
        lastHandRaiseTimeByHand[h] = nowHand;
        // priority: index-only, two-up, three-up, four-up
        if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
          // toggle bass
          bassOn = !bassOn;
          console.log('hand-raise index -> bassOn =', bassOn);
          if (bassOn) bassSound && bassSound.loop(); else bassSound && bassSound.stop();
        } else if (indexExtended && middleExtended && !ringExtended) {
          // toggle kick
          kickOn = !kickOn;
          console.log('hand-raise two-up -> kickOn =', kickOn);
          if (kickOn) kickSound && kickSound.loop(); else kickSound && kickSound.stop();
        } else if (indexExtended && middleExtended && ringExtended && !pinkyExtended) {
          synthOn = !synthOn;
          console.log('hand-raise three-up -> synthOn =', synthOn);
          if (synthOn) synthSound && synthSound.loop(); else synthSound && synthSound.stop();
        } else if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
          snareOn = !snareOn;
          console.log('hand-raise four-up -> snareOn =', snareOn);
          if (snareOn) snareSound && snareSound.loop(); else snareSound && snareSound.stop();
        }
        // mark as no longer down (we just raised)
        handWasDown[h] = false;
      } else {
        // update down state
        handWasDown[h] = isDown;
      }

      if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) anyIndexOnly = true;
      if (indexExtended && middleExtended && !ringExtended) anyTwoUp = true;
      // detect three/four finger states
      if (indexExtended && middleExtended && ringExtended && !pinkyExtended) anyThreeUp = true;
      if (indexExtended && middleExtended && ringExtended && pinkyExtended) anyFourUp = true;
      // peach/peace sign: thumb + index + middle, ring and pinky not extended
      if (thumbExtended && indexExtended && middleExtended && !ringExtended && !pinkyExtended) anyPeach = true;
      // detect fist: thumb extended, all other fingers not extended (RIGHT hand fist detection intentionally disabled)
      // (right-hand fist will not trigger audio)
  // detect open palm: all five fingers extended (RIGHT hand) -- removed as trigger; left hand controls master stop
  // (right-hand open palm will still be drawn by drawHandBox, but will not stop audio)

      // draw visuals for the right hand
      drawIndex(hand);
      drawThumb(hand);
      drawTips(hand);
      drawConnections(hand);
  drawLandmarks(hand);
  drawHandBox(hand, h);

      // right-hand specific: detect pinky+ring together (and index/middle not extended)
      if (ringExtended && pinkyExtended && !indexExtended && !middleExtended) {
        anyRightPinkyRing = true;
      }
    } // end of hands loop

    // --- audio toggle on rising edge: play on first index-up, stop on next index-up ---
    if (typeof bassSound !== 'undefined' && bassSound && typeof bassSound.isLoaded === 'function' && bassSound.isLoaded()) {
      const now = millis();
      // detect rising edge: index becomes up this frame but wasn't up previous frame
      if (anyIndexOnly && !prevIndexOnly && (now - lastToggleTime) > TOGGLE_COOLDOWN) {
        bassOn = !bassOn; // toggle state
        lastToggleTime = now;
        if (bassOn) {
          bassSound.loop();
        } else {
          bassSound.stop();
        }
      }
    }
    // update previous state for next frame
    prevIndexOnly = anyIndexOnly;
    // --- audio toggle for two-fingers (kick) on rising edge ---
    if (typeof kickSound !== 'undefined' && kickSound && typeof kickSound.isLoaded === 'function' && kickSound.isLoaded()) {
      const nowK = millis();
      if (anyTwoUp && !prevTwoUp && (nowK - lastTwoToggleTime) > TOGGLE_COOLDOWN) {
        kickOn = !kickOn;
        lastTwoToggleTime = nowK;
        if (kickOn) {
          kickSound.loop();
        } else {
          kickSound.stop();
        }
      }
    }
    prevTwoUp = anyTwoUp;
    // --- right-hand peach/peace sign detection (no longer plays hihat) ---
    // peach sign is still detected and can be used for visuals, but it will not trigger audio playback
    // keep prevPeach updated for consistency with frame-based state
    if (anyPeach && !prevPeach) {
      // optional debug: console.log('peach detected (right hand) - no audio action');
    }
    prevPeach = anyPeach;
    // --- audio toggle for right-hand pinky+ring (hihat) on rising edge ---
    if (typeof hihatSound !== 'undefined' && hihatSound && typeof hihatSound.isLoaded === 'function' && hihatSound.isLoaded()) {
      const nowHR = millis();
      if (anyRightPinkyRing && !prevRightPinkyRing && (nowHR - lastRightPinkyRingToggleTime) > TOGGLE_COOLDOWN) {
        // toggle canonical hihat state used elsewhere (e.g., left-pinky group toggle relies on hihatOn)
        hihatOn = !hihatOn;
        lastRightPinkyRingToggleTime = nowHR;
  console.log('right pinky -> hihatOn =', hihatOn);
        if (hihatOn) hihatSound.loop(); else hihatSound.stop();
      }
    }
    prevRightPinkyRing = anyRightPinkyRing;
    // --- audio toggle for LEFT-peach (effect) on rising edge ---
    if (typeof effectSound !== 'undefined' && effectSound && typeof effectSound.isLoaded === 'function' && effectSound.isLoaded()) {
      const nowLPeach = millis();
      if (anyLeftPeach && !prevLeftPeach && (nowLPeach - lastLeftPeachToggleTime) > TOGGLE_COOLDOWN) {
        leftEffectOn = !leftEffectOn;
        lastLeftPeachToggleTime = nowLPeach;
        console.log('left peach -> leftEffectOn =', leftEffectOn);
        if (leftEffectOn) effectSound.loop(); else effectSound.stop();
      }
    }
    prevLeftPeach = anyLeftPeach;
    // --- audio toggle for three-fingers (synth) on rising edge ---
    if (typeof synthSound !== 'undefined' && synthSound && typeof synthSound.isLoaded === 'function' && synthSound.isLoaded()) {
      const now3 = millis();
      if (anyThreeUp && !prevThreeUp && (now3 - lastThreeToggleTime) > TOGGLE_COOLDOWN) {
        synthOn = !synthOn;
        lastThreeToggleTime = now3;
        console.log('three fingers -> synthOn =', synthOn);
        if (synthOn) synthSound.loop(); else synthSound.stop();
      }
    }
    prevThreeUp = anyThreeUp;
    // --- audio toggle for four-fingers (snare) on rising edge ---
    if (typeof snareSound !== 'undefined' && snareSound && typeof snareSound.isLoaded === 'function' && snareSound.isLoaded()) {
      const now4 = millis();
      if (anyFourUp && !prevFourUp && (now4 - lastFourToggleTime) > TOGGLE_COOLDOWN) {
        snareOn = !snareOn;
        lastFourToggleTime = now4;
        console.log('four fingers -> snareOn =', snareOn);
        if (snareOn) snareSound.loop(); else snareSound.stop();
      }
    }
    prevFourUp = anyFourUp;

    // --- open-palm (master STOP) on rising edge for the RIGHT hand ---
    // If a right-hand open palm is detected, stop any playing sounds immediately
    const nowO = millis();
    if (anyOpenPalm && !prevOpenPalm && (nowO - lastOpenToggleTime) > TOGGLE_COOLDOWN) {
      lastOpenToggleTime = nowO;
  console.log('left open palm detected -> stopping all sounds');
      // stop every sound if present
      if (bassSound && typeof bassSound.stop === 'function') bassSound.stop();
      if (kickSound && typeof kickSound.stop === 'function') kickSound.stop();
      if (hihatSound && typeof hihatSound.stop === 'function') hihatSound.stop();
      if (snareSound && typeof snareSound.stop === 'function') snareSound.stop();
      if (synthSound && typeof synthSound.stop === 'function') synthSound.stop();
      if (effectSound && typeof effectSound.stop === 'function') effectSound.stop();
      // clear state flags so toggles reflect actual playback state
      allOn = false;
      bassOn = kickOn = hihatOn = snareOn = synthOn = effectOn = false;
    }
    prevOpenPalm = anyOpenPalm;

  } else {
    // no detections => keep current toggle state; do not auto-stop so bass remains until explicitly toggled off
  } // end of if detections
  
    // draw threshold HUD so user can see / tune DOWN/UP ratios
    if (typeof drawThresholdHUD === 'function') drawThresholdHUD();

  } // end of draw


// only the index finger tip landmark
function drawIndex(landmarks) {

  // get the index fingertip landmark
  let mark = landmarks[FINGER_TIPS.index];

  noStroke();
  // set fill color for index fingertip -> yellow (small dot)
  fill(255, 255, 0);

  // adapt the coordinates (0..1) to video coordinates
  let x = mark.x * videoElement.width;
  let y = mark.y * videoElement.height;
  // small dot same size as other landmarks
  circle(x, y, 6);

}


// draw the thumb finger tip landmark
function drawThumb(landmarks) {

  // get the thumb fingertip landmark
  let mark = landmarks[FINGER_TIPS.thumb];

  noStroke();
  // set fill color for thumb fingertip -> yellow (small dot)
  fill(255, 255, 0);

  // adapt the coordinates (0..1) to video coordinates
  let x = mark.x * videoElement.width;
  let y = mark.y * videoElement.height;
  // small dot same size as other landmarks
  circle(x, y, 6);

}

function drawTips(landmarks) {

  // no per-finger labels anymore (names removed from fingertips)
  // keep this function empty so no text appears above individual fingers
}


// draw all landmarks of a hand
function drawLandmarks(landmarks) {

  noStroke();
  // set fill color for landmarks -> yellow
  fill(255, 255, 0);

  for (let mark of landmarks) {
    // adapt the coordinates (0..1) to video coordinates
    let x = mark.x * videoElement.width;
    let y = mark.y * videoElement.height;
    circle(x, y, 3);
  }

}


function drawConnections(landmarks) {

  // set stroke color for connections -> yellow
  stroke(255, 255, 0);

  // iterate through each connection
  for (let connection of HAND_CONNECTIONS) {
    // get the two landmarks to connect
    const a = landmarks[connection[0]];
    const b = landmarks[connection[1]];
    // skip if either landmark is missing
    if (!a || !b) continue;
    // landmarks are normalized [0..1], (x,y) with origin top-left
    let ax = a.x * videoElement.width;
    let ay = a.y * videoElement.height;
    let bx = b.x * videoElement.width;
    let by = b.y * videoElement.height;
    line(ax, ay, bx, by);
  }

}

// smoothing globals for the hand box
const BOX_LERP = 0.25; // 0 = no movement, 1 = instant follow; 조절해서 반응속도 변경
let boxSmoothed = { cx: 0, cy: 0, size: 0 };

// draw a square bounding box around the given hand landmarks
function drawHandBox(landmarks, handIndex = 0) {
  if (!landmarks || landmarks.length === 0) return;

  // compute min/max in video coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let lm of landmarks) {
    const x = lm.x * videoElement.width;
    const y = lm.y * videoElement.height;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const w = maxX - minX;
  const h = maxY - minY;
  const targetSize = max(w, h); // target square exactly fits hand bounds
  // center the square over the bounding box center
  const targetCx = minX + w / 2;
  const targetCy = minY + h / 2;

  // initialize smoothed box to target on first detection to avoid jump
  if (boxSmoothed.size === 0) {
    boxSmoothed.cx = targetCx;
    boxSmoothed.cy = targetCy;
    boxSmoothed.size = targetSize;
  } else {
    // smooth toward target
    boxSmoothed.cx = lerp(boxSmoothed.cx, targetCx, BOX_LERP);
    boxSmoothed.cy = lerp(boxSmoothed.cy, targetCy, BOX_LERP);
    boxSmoothed.size = lerp(boxSmoothed.size, targetSize, BOX_LERP);
  }

  // draw using smoothed values
  rectMode(CENTER);
  const isDownVisual = !!handWasDown[handIndex];
  if (isDownVisual) {
    noStroke();
    fill(255, 80, 80, 48);
    rect(boxSmoothed.cx, boxSmoothed.cy, boxSmoothed.size, boxSmoothed.size, 6);
    stroke(255, 80, 80);
  } else {
    noFill();
    stroke(255, 255, 0);
  }
  strokeWeight(3);
  rect(boxSmoothed.cx, boxSmoothed.cy, boxSmoothed.size, boxSmoothed.size);

  // compute square bounds for hit test (kept for potential use)
  const half = boxSmoothed.size / 2;
  const boxMinX = boxSmoothed.cx - half;
  const boxMaxX = boxSmoothed.cx + half;
  const boxMinY = boxSmoothed.cy - half;
  const boxMaxY = boxSmoothed.cy + half;

  // --- updated: detect finger extension including pinky and thumb ---
  // indices: index tip(8), index pip(6), middle tip(12), middle pip(10),
  // ring tip(16), ring pip(14), pinky tip(20), pinky pip(18), thumb tip(4), thumb mcp(2)
  const it = landmarks[8], ip = landmarks[6];
  const mt = landmarks[12], mp = landmarks[10];
  const rt = landmarks[16], rp = landmarks[14];
  const pt = landmarks[20], pp = landmarks[18];
  const tt = landmarks[4], tm = landmarks[2];

  const H = videoElement.height;
  const W = videoElement.width;
  const handRef = boxSmoothed.size || Math.max(w, h);

  let indexExtended = false, middleExtended = false, ringExtended = false, pinkyExtended = false, thumbExtended = false;
  if (it && ip) indexExtended = (it.y * H) < (ip.y * H);
  if (mt && mp) middleExtended = (mt.y * H) < (mp.y * H);
  if (rt && rp) ringExtended = (rt.y * H) < (rp.y * H);
  if (pt && pp) pinkyExtended = (pt.y * H) < (pp.y * H);
  // thumb: check horizontal displacement relative to hand size
  if (tt && tm) {
    const ttx = tt.x * W;
    const tmx = tm.x * W;
    thumbExtended = Math.abs(ttx - tmx) > (handRef * 0.25);
  }

  // determine label with priority:
  // 1) open palm (all five)
  // 2) peach sign (thumb+index+middle, ring and pinky NOT extended)
  // 3) four / three / two / index / fist (thumb-only now mapped to "fist")
  let label = null;
  if (thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
    label = 'open palm';
  } else if (thumbExtended && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
    label = 'peach sign';
  } else if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
    label = 'four fingers up';
  } else if (indexExtended && middleExtended && ringExtended) {
    label = 'three fingers up';
  } else if (indexExtended && middleExtended && !ringExtended) {
    label = 'two fingers up';
  } else if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    label = 'index up';
  } else if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    label = 'fist';
  }

  if (label) {
    noStroke();
    fill(255, 255, 0);
    textSize(14);
    textAlign(CENTER, BOTTOM);
    const nameX = boxSmoothed.cx;
    const nameY = boxMinY - 8; // slightly above the square
    text(label, nameX, nameY);
  }
  // --- end updated code ---

  // restore defaults used elsewhere
  strokeWeight(2);
  stroke(255, 255, 0);
}

function keyPressed() {
  // adjust HAND_DOWN_RATIO with '[' and ']'
  if (key === '[') {
    HAND_DOWN_RATIO = constrain(HAND_DOWN_RATIO - 0.02, 0.3, 0.95);
    console.log('HAND_DOWN_RATIO ->', HAND_DOWN_RATIO);
  } else if (key === ']') {
    HAND_DOWN_RATIO = constrain(HAND_DOWN_RATIO + 0.02, 0.3, 0.95);
    console.log('HAND_DOWN_RATIO ->', HAND_DOWN_RATIO);
  } else if (key === ';') {
    HAND_UP_RATIO = constrain(HAND_UP_RATIO - 0.02, 0.2, 0.9);
    console.log('HAND_UP_RATIO ->', HAND_UP_RATIO);
  } else if (key === "'") {
    HAND_UP_RATIO = constrain(HAND_UP_RATIO + 0.02, 0.2, 0.9);
    console.log('HAND_UP_RATIO ->', HAND_UP_RATIO);
  }
}
