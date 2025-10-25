// the video element used by MediaPipe Camera util
let videoElement;
// if detections is null it means no hands detected
let detections = null;

// Create the Hands instance and provide a tiny init helper.
if (!window.hands) {
    window.hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
}

// now create a local reference to the shared instance
const hands = window.hands;

const FINGER_TIPS = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20
};

const HAND_CONNECTIONS = [
    // wrist to thumb
    [0, 1], [1, 2], [2, 3], [3, 4],
    // wrist to index
    [0, 5], [5, 6], [6, 7], [7, 8],
    // middle
    [0, 9], [9, 10], [10, 11], [11, 12],
    // ring
    [0, 13], [13, 14], [14, 15], [15, 16],
    // pinky
    [0, 17], [17, 18], [18, 19], [19, 20]
];

// Optional helper to set default options from one place
window.initHands = (opts = {}) => {
    const defaults = {
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
        selfieMode: true
    };
    window.hands.setOptions(Object.assign({}, defaults, opts));
    return window.hands;
};

function setupVideo(selfieMode = true) {
    // create a hidden video element that MediaPipe Camera util will use
    videoElement = createCapture(VIDEO, { flipped: selfieMode });
    videoElement.size(640, 480);
    videoElement.hide();

    // Use MediaPipe Camera util to feed frames from the p5 video element
    // cameraUtils expects a DOM video element; p5's capture has an elt property
    cam = new Camera(videoElement.elt, {
        onFrame: async () => {
            await hands.send({ image: videoElement.elt });
        },
        width: 640,
        height: 480
    });

    cam.start();
}

function setupHands() {

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
        selfieMode: true,
    });

  // register results handler on the shared instance
  hands.onResults(onHandsResults);

}

// store the results of the hand detection
function onHandsResults(results) {
  detections = results;
}


// move the videoElement && videoElement.loadedmetadata checks to here
function isVideoReady() {
    return videoElement && videoElement.loadedmetadata;
}