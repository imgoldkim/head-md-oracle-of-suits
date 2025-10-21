// create an empty array 
let values = [];
// create an oscillator 
let osc;
//which note to play
let index = 10;
//start a countdown liner
let liner = 100;

// bass oscillator + analyzer to move the visuals
let bassOsc;
let bassAmp;
let playing = false;

// visual phase driven by the bass (makes the wave "move through" the osc)
let wavePhase = 10;
let bassFreq = 64;

// note change timer + index
let noteTimer = null;
let noteIndex = 1;
let minVal = 100;
let maxVal = 1;

function setup() {
    // fit the canvas to the window size
  createCanvas(windowWidth, windowHeight);

   // add 100 random values to the array
  for (let i = 0; i < 100; i++) {
    values.push(random(100,12));
  } 

    // compute min/max for mapping notes
  minVal = min(values);
  maxVal = max(values);

  // create a low bass oscillator that will drive motion (silent until user gesture)
  bassOsc = new p5.Oscillator('sine');
  bassOsc.freq(64);    // bass fundamental
  bassOsc.amp(0, 0);   // start silent so level reads 0 until user starts
  bassOsc.start();

  // amplitude analyzer reading only the bass oscillator
  bassAmp = new p5.Amplitude();
  bassAmp.setInput(bassOsc);
}

  function draw() { 
  background(30);
  // do something interessting with the values array
    stroke(500);
    strokeWeight(0.8);

  // read current audio level and use it to drive motion
  const level = bassAmp.getLevel(); // small value ~0..0.3 depending on amp
  // map level into a sensible motion range (keeps visual form unchanged)
  const levelDrive = map(level, 0, 0.12, 0, 1, true);

  // frequency affects how quickly the phase advances and the local wobble frequency
  const freqDrive = map(bassFreq, 40, 800, 0.5, 3.0, true);

  // advance global phase: louder or higher freq -> faster phase progression
  // increased multiplier to make motion more pronounced
  wavePhase += 2.0 * levelDrive * freqDrive;

  for (let i = 0; i < values.length; i++) {

    // original coordinates preserved; add a small wobble driven by the bass
    const startX = i * (5 / values.length);
    const endX = i * (width / values.length);

    // compute a move factor from current audio level (restored to very large scale)
    // this produces the large-scale wave movement you had before
    const move = map(level, 0.2, 2.12, 150, 2000, true); // larger range -> much larger wobble

    // wobble now depends on global phase, per-index offset, audio level and frequency
    // keeps the exact line/shape drawing the same but makes movement follow sound
    const localPhase = (frameCount + i) * 0.05 * freqDrive + wavePhase;
    const wobble = Math.sin(localPhase) * (10 + move * 0.3) * (0.5 + levelDrive);

    const y = height - values[i] + wobble;

    line(startX, 15, endX, y);
  }
}

// toggle bass on click/tap
function mousePressed() {
  // unlock/resume audio on browsers
  if (typeof userStartAudio === 'function') userStartAudio();
  if (getAudioContext && getAudioContext().state !== 'running') getAudioContext().resume();

  if (!playing) {
    // fade in to a reasonable amplitude (was very large before)
    bassOsc.amp(1.9, 0.15); // fade in
    playing = true;
  } else {
    bassOsc.amp(0, 0.2); // fade out to silent
    playing = false;
  }
}

function touchStarted() {
  return mousePressed();
}

//change frequency on mouse move (update bassFreq so movement follows frequency)
function mouseMoved() {
  const freq = map(mouseX, 40, 130, 50, 100);
  bassOsc.freq(freq);
  bassFreq = freq;
}


