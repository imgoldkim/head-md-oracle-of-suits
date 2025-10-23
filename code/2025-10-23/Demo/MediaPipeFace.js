// MediaPipeFace.js — minimal helper modeled after your Hands example

console.log("MediaPipeFace.js loaded");

// the p5 video element used by MediaPipe Camera util
let videoElement;
// store the latest detection results (null = none)
let detections = null;
// camera util instance
let cam = null;
// helper that will send a frame to the face model (set up in setupFace/setupVideo)
let faceSendFrame = null;
// indicate model ready
let faceReady = false;
// whether we should present results as a selfie (mirror X)
window.selfieModeActive = true;

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

// flip one landmark (supports {x,y} objects or [x,y,...] arrays)
function _flipLandmarkX(lm) {
  if (!lm) return lm;
  if (typeof lm.x === 'number') {
    return { x: 1 - lm.x, y: lm.y, z: lm.z, ...lm }; // preserve extra props
  }
  if (Array.isArray(lm) && lm.length >= 2) {
    const copy = lm.slice();
    copy[0] = 1 - copy[0];
    return copy;
  }
  return lm;
}

// convert a single landmark to pixel coords matching the hidden video element
function markToPixel(mark, w, h) {
  if (!mark) return null;
  const x = (mark.x != null && mark.x <= 1) ? mark.x * w : mark.x;
  const y = (mark.y != null && mark.y <= 1) ? mark.y * h : mark.y;
  return { x, y };
}

// flip a single face landmark array
function _flipLandmarkArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(lm => _flipLandmarkX(lm));
}

// flip all landmark groups in a results-like object and return a shallow clone
function _flipResultsForSelfie(results) {
  if (!results) return results;
  const out = Object.assign({}, results);

  if (Array.isArray(out.faceLandmarks)) {
    out.faceLandmarks = out.faceLandmarks.map(fl => _flipLandmarkArray(fl));
  }
  if (Array.isArray(out.multiFaceLandmarks)) {
    out.multiFaceLandmarks = out.multiFaceLandmarks.map(fl => _flipLandmarkArray(fl));
  }
  if (Array.isArray(out.landmarks)) {
    out.landmarks = out.landmarks.map(fl => _flipLandmarkArray(fl));
  }
  if (out.faceLandmark && Array.isArray(out.faceLandmark)) {
    out.faceLandmark = _flipLandmarkArray(out.faceLandmark);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model creation / setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create/load a FaceLandmarker instance using the Tasks Vision package.
 * Matches the Google demo (FilesetResolver + FaceLandmarker.createFromOptions).
 */
async function createFaceModel(opts = {}) {
  if (window.face && faceReady) return window.face;

  // Try to use an already-available instance first
  if (window.face) {
    faceReady = true;
    return window.face;
  }

  try {
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3');
    const { FilesetResolver, FaceLandmarker } = vision;

    // Resolve wasm files used by the tasks package
    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    );

    // Create the FaceLandmarker (VIDEO mode for realtime)
    const model = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: opts.numFaces || 1,
      outputFaceBlendshapes: true      // ⬅️ turn on predictions
    });

    window.face = model;
    faceReady = true;
    return window.face;
  } catch (err) {
    console.warn('MediaPipeFace: failed to create FaceLandmarker via tasks-vision:', err);

    // fall back to older FaceMesh/face_landmark globals if present (best-effort)
    if (window.FaceLandmarker) {
      try {
        window.face = new window.FaceLandmarker({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_landmark/${f}`
        });
        faceReady = true;
        console.log('MediaPipeFace: created instance using window.FaceLandmarker fallback.');
        return window.face;
      } catch (e) {
        console.warn('MediaPipeFace: fallback FaceLandmarker instantiation failed:', e);
      }
    }
    if (window.FaceMesh) {
      try {
        window.face = new window.FaceMesh({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
        });
        faceReady = true;
        console.log('MediaPipeFace: created instance using window.FaceMesh fallback.');
        return window.face;
      } catch (e) {
        console.warn('MediaPipeFace: fallback FaceMesh instantiation failed:', e);
      }
    }
    throw err;
  }
}

// call this in your sketch.setup() to configure the face instance and results handler
async function setupFace(opts = {}) {
  try {
    const inst = await createFaceModel(opts);
    if (!inst) {
      console.warn('setupFace: no instance created.');
      return;
    }

    // Apply options if supported
    const DEFAULT_FACE_OPTIONS = {
      numFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      selfieMode: true
    };
    const options = Object.assign({}, DEFAULT_FACE_OPTIONS, opts);
    if (typeof inst.setOptions === 'function') {
      try { inst.setOptions(options); } catch (e) { /* ignore */ }
    }

    // Wire results if FaceMesh-style API is present; otherwise we’ll use detectForVideo
    if (typeof inst.onResults === 'function') {
      inst.onResults(onFaceResults);
      faceSendFrame = async () => {
        if (!videoElement) return;
        try {
          await inst.send({ image: videoElement.elt });
        } catch (err) {
          console.warn('face.send error:', err);
        }
      };
    } else {
      faceSendFrame = null;
      console.log('setupFace: onResults not found; will use detect/detectForVideo patterns.');
    }
  } catch (err) {
    console.warn('setupFace: failed to create/configure model:', err);
  }
}

// create a hidden p5 video capture and start the MediaPipe Camera util
function setupVideo(selfieMode = true, width = 640, height = 480) {
  window.selfieModeActive = !!selfieMode;

  videoElement = createCapture(VIDEO, { flipped: false });
  videoElement.size(width, height);
  videoElement.hide();

  if (!window.Camera) {
    console.warn('MediaPipe Camera util not found. Ensure camera_utils is loaded.');
    return;
  }

  cam = new Camera(videoElement.elt, {
    onFrame: async () => {
      if (!window.face) return;

      if (typeof faceSendFrame === 'function') {
        await faceSendFrame();
        return;
      }

      try {
        if (typeof window.face.detectForVideo === 'function') {
          const res = await window.face.detectForVideo(videoElement.elt, performance.now());
          if (res) onFaceResults(res);
          return;
        }

        if (typeof window.face.detect === 'function') {
          const res = await window.face.detect(videoElement.elt);
          if (res) onFaceResults(res);
          return;
        }

        if (typeof window.face.send === 'function') {
          await window.face.send({ image: videoElement.elt });
          return;
        }

        console.warn('No known face model method found (send/detect/detectForVideo).', Object.keys(window.face));
      } catch (err) {
        console.warn('Error while sending frame to face model:', err);
      }
    },
    width,
    height
  });

  cam.start();
}

// results handler: store the latest detections
function onFaceResults(results) {
  if (window.selfieModeActive) {
    try {
      detections = _flipResultsForSelfie(results);
      return;
    } catch (e) {
      console.warn('Failed to flip results for selfie mode, using original results:', e);
    }
  }
  detections = results;
}

// get an array of face landmark sets in a backward-compatible way
function getFaceLandmarks() {
  if (!detections) return null;
  return detections.multiFaceLandmarks || detections.faceLandmarks || detections.landmarks || null;
}

// helper to let sketch know when the video is ready
function isVideoReady() {
  return videoElement && videoElement.loadedmetadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: lightweight connector access (no hard-coded indices or aliases)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the MediaPipe connector graph (array of [a,b] pairs) for a feature key,
 * e.g. 'FACE_LANDMARKS_LEFT_EYE', 'FACE_LANDMARKS_RIGHT_EYE', 'FACE_LANDMARKS_LIPS',
 * 'FACE_LANDMARKS_FACE_OVAL', etc. Returns null if unavailable.
 */
function getFaceConnectors(featureKey) {
  const FaceClass = window.face && window.face.constructor;
  if (!FaceClass) return null;
  const val = FaceClass[featureKey];
  return Array.isArray(val) ? val : null;
}

/**
 * Convenience: collect *unique* landmark indices referenced by a connector graph.
 * Useful if you want points (unordered) instead of edges.
 */
function connectorsToIndexSet(connectors) {
  if (!Array.isArray(connectors)) return null;
  const set = new Set();
  for (const p of connectors) {
    if (Array.isArray(p) && p.length >= 2) {
      set.add(p[0]); set.add(p[1]);
    } else if (p && typeof p.start === 'number' && typeof p.end === 'number') {
      set.add(p.start); set.add(p.end);
    }
  }
  return set.size ? Array.from(set) : null;
}

/**
 * Return pixel coords (or raw landmarks) for either:
 *  - a string featureKey that points to a MediaPipe connector set, or
 *  - a numeric index array that you pass directly.
 *
 * Note: when a connector graph is provided, points are returned as an *unordered*
 * unique set (good for scatter plots). For drawing proper eye/lip shapes, iterate
 * the connector pairs and draw segments.
 */
function getFaceFeature(featureKeyOrIndices, faceIndex = 0, toPixels = true) {
  const faces = getFaceLandmarks();
  if (!faces || faces.length <= faceIndex) return null;
  const landmarks = faces[faceIndex];

  let indices = null;

  if (typeof featureKeyOrIndices === 'string') {
    const cons = getFaceConnectors(featureKeyOrIndices);
    if (cons) indices = connectorsToIndexSet(cons);
  } else if (Array.isArray(featureKeyOrIndices) && typeof featureKeyOrIndices[0] === 'number') {
    indices = featureKeyOrIndices.slice();
  }

  if (!indices || !indices.length) return null;

  const out = [];
  for (const idx of indices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    out.push(toPixels ? markToPixel(lm, videoElement.width, videoElement.height) : lm);
  }
  return out.length ? out : null;
}



// ─────────────────────────────────────────────────────────────────────────────
// FACE GEOMETRY HELPERS (no drawing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a list of edges ({a,b}) for a given connector key.
 * Each edge has landmark objects as {a, b}, not pixel coords.
 * Use markToPixel() in your sketch for rendering.
 */
function getFeatureEdges(landmarks, connectorKey) {
  const pairs = getFaceConnectors(connectorKey);
  if (!pairs) return [];
  const edges = [];

  for (const p of pairs) {
    let aIdx, bIdx;
    if (Array.isArray(p)) {
      aIdx = p[0]; bIdx = p[1];
    } else if (p && typeof p === 'object') {
      aIdx = p.start !== undefined ? p.start : p[0];
      bIdx = p.end !== undefined ? p.end : p[1];
    } else continue;

    const a = landmarks[aIdx];
    const b = landmarks[bIdx];
    if (!a || !b) continue;

    edges.push({ a, b });
  }
  return edges;
}


/**
 * Build ordered rings (polygons) from a MediaPipe connector graph.
 * Returns an array of rings; each ring is an array of landmarks (in order).
 *
 * Example:
 *   const rings = getFeatureRings('FACE_LANDMARKS_LIPS');
 *   // rings[0] is the outer lip, rings[1] is the inner lip hole
 */
function getFeatureRings(featureKey, faceIndex = 0, toPixels = true) {
  const connectors = getFaceConnectors(featureKey);
  if (!connectors || !connectors.length) return null;

  const faces = getFaceLandmarks();
  if (!faces || faces.length <= faceIndex) return null;
  const landmarks = faces[faceIndex];

  // 1) Build UNDIRECTED adjacency: u <-> v
  const adj = new Map(); // idx -> Set(neighbors)
  const add = (u, v) => {
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u).add(v);
    adj.get(v).add(u);
  };

  for (const e of connectors) {
    if (Array.isArray(e) && e.length >= 2) add(e[0], e[1]);
    else if (e && typeof e.start === 'number' && typeof e.end === 'number') add(e.start, e.end);
  }
  if (adj.size === 0) return null;

  // 2) Walk cycles in each connected component
  const visited = new Set();
  const ringsIdx = [];

  const walkCycleFrom = (start) => {
    // pick an arbitrary neighbor to start the direction
    const nbs = Array.from(adj.get(start) || []);
    if (nbs.length === 0) return null;
    let prev = start;
    let cur = nbs[0];
    const ring = [start];

    // mark start as visited for this ring
    visited.add(start);

    // walk until we return to start or get stuck
    while (true) {
      ring.push(cur);
      visited.add(cur);
      const neighbors = Array.from(adj.get(cur) || []);
      // choose the neighbor that is NOT the previous node
      const next = neighbors.find(x => x !== prev);
      if (next === undefined) break;           // dead end (shouldn't happen on proper loops)
      if (next === start) {                    // closed loop
        ringsIdx.push(ring);
        return true;
      }
      prev = cur;
      cur = next;
      if (ring.length > 2000) break;           // safety
    }
    return false;
  };

  // process all components
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    // Try to start from a degree-2 node (prefer closed-loop behavior)
    const deg = (i) => (adj.get(i) ? adj.get(i).size : 0);
    let start = node;
    if (deg(node) !== 2) {
      // search a degree-2 node in this component
      const stack = [node];
      const seen = new Set([node]);
      let found = null;
      while (stack.length) {
        const u = stack.pop();
        if (deg(u) === 2) { found = u; break; }
        for (const v of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); stack.push(v); }
      }
      if (found != null) start = found;
    }
    walkCycleFrom(start);
  }

  // 3) Map indices -> points (pixels or raw landmarks)
  const ringsPts = ringsIdx.map(ring => ring.map(idx => {
    const lm = landmarks[idx];
    return toPixels ? markToPixel(lm, videoElement.width, videoElement.height) : lm;
  })).filter(r => r && r.length);

  return ringsPts.length ? ringsPts : null;
}

/**
 * Return only the outer ring (first ring) for a given feature.
 */
function getFeatureOuterRing(featureKey, faceIndex = 0, toPixels = true) {
  const rings = getFeatureRings(featureKey, faceIndex, toPixels);
  return rings ? rings[0] : null;
}

// expose to window
window.getFeatureEdges = getFeatureEdges;
window.getFeatureRings = getFeatureRings;
window.getFeatureOuterRing = getFeatureOuterRing;




/**
 * Resolve a connector graph (pairs or {start,end}) into ordered rings of landmark points.
 * - featureKey: e.g. 'FACE_LANDMARKS_LIPS' or any key understood by getFaceConnectors()
 * - faceIndex: which detected face to use (default 0)
 * - toPixels: convert normalized landmarks to pixel coords (default true)
 *
 * Returns:
 *  - null if unavailable
 *  - an array of rings: [[{x,y},...], [{x,y},...], ...]
 *    (rings may be 1 element long for single polygons)
 */
function getFaceConnectorPoints(featureKey, faceIndex = 0, toPixels = true) {
  const connectors = getFaceConnectors(featureKey);
  if (!connectors || !connectors.length) return null;

  const faces = getFaceLandmarks();
  if (!faces || faces.length <= faceIndex) return null;
  const landmarks = faces[faceIndex];

  // Build directed mapping start -> end for edges (supports [a,b] pairs and {start,end} objects)
  const forward = new Map();
  const reverse = new Map();
  for (const e of connectors) {
    if (Array.isArray(e) && e.length >= 2 && typeof e[0] === 'number' && typeof e[1] === 'number') {
      forward.set(e[0], e[1]);
      reverse.set(e[1], e[0]);
    } else if (e && typeof e === 'object' && typeof e.start === 'number' && typeof e.end === 'number') {
      forward.set(e.start, e.end);
      reverse.set(e.end, e.start);
    }
  }

  if (forward.size === 0) return null;

  const ringsIdx = [];
  // Reconstruct one or more chains/polygons until mapping exhausted
  while (forward.size > 0) {
    // pick a start that is not anyone's end (preferred), otherwise any key
    let start = null;
    for (const k of forward.keys()) { if (!reverse.has(k)) { start = k; break; } }
    if (start === null) start = forward.keys().next().value;

    const ring = [];
    const seen = new Set();
    let cur = start;
    while (cur != null && !seen.has(cur)) {
      ring.push(cur);
      seen.add(cur);
      const next = forward.get(cur);
      // remove current entry to avoid revisiting it
      forward.delete(cur);
      if (next != null) reverse.delete(next);
      cur = next;
    }

    if (ring.length) ringsIdx.push(ring);
  }

  // Map index rings -> point rings (pixels or raw landmarks)
  const ringsPts = ringsIdx.map(ring => {
    const pts = [];
    for (const idx of ring) {
      const lm = landmarks[idx];
      if (!lm) continue;
      pts.push(toPixels ? markToPixel(lm, videoElement.width, videoElement.height) : lm);
    }
    return pts;
  }).filter(r => r && r.length);

  return ringsPts.length ? ringsPts : null;
}

window.getFaceConnectorPoints = getFaceConnectorPoints;


// feature detections
// Return the raw MediaPipe blendshape array for a given face (or null).
function getFaceBlendshapes(faceIndex = 0) {
  if (!detections) return null;
  const arr = detections.faceBlendshapes || detections.blendshapes || null;
  if (!arr || !arr.length || !arr[faceIndex]) return null;
  // Each entry has .categories: [{categoryName, score, displayName?}, ...]
  return arr[faceIndex];
}

// Return a sorted (desc) array of {name, score} pairs for easy display.
function getBlendshapeList(faceIndex = 0) {
  const bs = getFaceBlendshapes(faceIndex);
  if (!bs || !Array.isArray(bs.categories)) return null;
  return bs.categories
    .map(c => ({ name: c.categoryName || c.displayName || 'unknown', score: c.score || 0 }))
    .sort((a, b) => b.score - a.score);
}

// Quick lookup: score by name (0 if not found)
function getBlendshapeScore(name, faceIndex = 0) {
  const list = getBlendshapeList(faceIndex);
  if (!list) return 0;
  const hit = list.find(it => it.name === name);
  return hit ? hit.score : 0;
}

// expose for sketch/console
window.getFaceBlendshapes = getFaceBlendshapes;
window.getBlendshapeList = getBlendshapeList;
window.getBlendshapeScore = getBlendshapeScore;

// Debug helpers for console
function listFaceModelConstants() {
  const FaceClass = window.face && window.face.constructor;
  if (!FaceClass) return null;
  return Object.keys(FaceClass).filter(k => typeof FaceClass[k] !== 'undefined');
}
function getFaceModelConstant(name) {
  const FaceClass = window.face && window.face.constructor;
  return (FaceClass && FaceClass[name]) || null;
}

window.listFaceModelConstants = listFaceModelConstants;
window.getFaceModelConstant = getFaceModelConstant;

// Expose the main functions your sketch expects
window.setupFace = setupFace;
window.setupVideo = setupVideo;
window.onFaceResults = onFaceResults;
window.getFaceLandmarks = getFaceLandmarks;
window.isVideoReady = isVideoReady;
window.markToPixel = markToPixel;
window.getFaceConnectors = getFaceConnectors;
window.getFaceFeature = getFaceFeature;

// -----------------------------------------------------------------------------
// MOUTH / LIPS helpers (convenience wrappers using connector utilities)
// -----------------------------------------------------------------------------
// return array of rings for the lips feature (outer, inner) or null
function getMouthRings(faceIndex = 0, toPixels = true) {
	// reuse FACE_LANDMARKS_LIPS connector key if available
	return getFeatureRings('FACE_LANDMARKS_LIPS', faceIndex, toPixels);
}

// simple centroid of a point array [{x,y},...]
function _centroid(points) {
	if (!points || !points.length) return null;
	let sx = 0, sy = 0;
	for (const p of points) { sx += p.x; sy += p.y; }
	return { x: sx / points.length, y: sy / points.length };
}

// return the mouth center (centroid of outer lip ring) in pixels, or null
function getMouthCenter(faceIndex = 0) {
	const rings = getMouthRings(faceIndex, true);
	if (!rings || !rings.length) return null;
	// outer ring is rings[0]
	return _centroid(rings[0]);
}

// compute a simple mouth openness metric:
// use inner-lip ring vertical span (maxY - minY) normalized by face-oval height (or video height)
function getMouthOpenness(faceIndex = 0) {
	const rings = getMouthRings(faceIndex, true);
	if (!rings) return 0;
	// prefer inner ring for vertical lip gap (if available)
	const inner = rings.length > 1 ? rings[1] : null;
	const target = inner || rings[0]; // if inner not present, use outer ring approximation
	if (!target || !target.length) return 0;

	let minY = Infinity, maxY = -Infinity;
	for (const p of target) {
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	if (!isFinite(minY) || !isFinite(maxY)) return 0;
	const gap = Math.max(0, maxY - minY);

	// compute normalization height: face oval height if available, else video height
	let normH = null;
	const oval = getFeatureOuterRing('FACE_LANDMARKS_FACE_OVAL', faceIndex, true);
	if (oval && oval.length) {
		let minOy = Infinity, maxOy = -Infinity;
		for (const p of oval) { if (p.y < minOy) minOy = p.y; if (p.y > maxOy) maxOy = p.y; }
		if (isFinite(minOy) && isFinite(maxOy) && (maxOy - minOy) > 0) normH = (maxOy - minOy);
	}
	if (!normH) normH = (videoElement && videoElement.height) ? videoElement.height : 1;

	// normalized openness ~ 0..1 (may be small values)
	return gap / normH;
}

// expose mouth helpers
window.getMouthRings = getMouthRings;
window.getMouthCenter = getMouthCenter;
window.getMouthOpenness = getMouthOpenness;