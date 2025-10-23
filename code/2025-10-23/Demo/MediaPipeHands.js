// the video element used by MediaPipe Camera util
let videoElement;
// if detections is null it means no hands detected
let detections = null;
// camera error message (populated if camera fails to start)
let cameraErrorMsg = null;

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
    try {
        cameraErrorMsg = null;

        // Desired camera size (may be unsupported on many webcams/devices)
        const CAMERA_SIZE = 3000;

        // Try to request a high-resolution video using getUserMedia constraints.
        // If the device or browser doesn't support it, the promise may still succeed
        // but the actual resolution will be lower.
        const constraints = {
            video: {
                width: { ideal: CAMERA_SIZE },
                height: { ideal: CAMERA_SIZE },
                facingMode: selfieMode ? 'user' : 'environment'
            },
            audio: false
        };

        // p5.createCapture accepts a constraints object similar to getUserMedia
        // Use constraints and fall back to the simple createCapture(VIDEO) if needed.
        try {
            videoElement = createCapture(constraints, () => {
                // callback after capture initialized
            });
        } catch (e) {
            // fallback for older p5 versions: use VIDEO constant
            videoElement = createCapture(VIDEO, { flipped: selfieMode });
        }

        // set nominal size (p5 will scale the element if needed)
        try {
            videoElement.size(CAMERA_SIZE, CAMERA_SIZE);
        } catch (e) {
            // ignore if p5 doesn't accept size
        }
        videoElement.hide();

        // Use MediaPipe Camera util to feed frames from the p5 video element
        // cameraUtils expects a DOM video element; p5's capture has an elt property
        cam = new Camera(videoElement.elt, {
            onFrame: async () => {
                await hands.send({ image: videoElement.elt });
            },
            width: CAMERA_SIZE,
            height: CAMERA_SIZE
        });

        cam.start();
    } catch (err) {
        // surface the error so the sketch can show diagnostics
        cameraErrorMsg = String(err.message || err);
        console.error('Camera start error:', err);
    }
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
    // If we have a p5.Video capture, check the underlying DOM video element's readyState
    if (!videoElement) return false;
    try {
        const elt = videoElement.elt || null;
        // readyState >= 2 means HAVE_CURRENT_DATA — acceptable for drawing
        if (elt && elt.readyState >= 2) return true;
        // fallback to p5's loadedmetadata flag
        if (videoElement.loadedmetadata) return true;
        // fallback to checking videoWidth (non-zero when stream active)
        if (elt && elt.videoWidth && elt.videoWidth > 0) return true;
    } catch (e) {
        // any unexpected error treat as not ready
    }
    return false;
}