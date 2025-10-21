// create an empty array named things
let things = [];

function setup() {
  // full window canvas
  createCanvas(windowWidth, windowHeight);
}

function draw() {
  background(220);
  // draw all the things
  for (let i = 0; i < things.length; i++) {
    things[i].draw();
  }
} // <-- close draw() here

function mousePressed() {
  // create and initialize via the static factory
  let t = Things.create(mouseX, mouseY);
  things.push(t);
}