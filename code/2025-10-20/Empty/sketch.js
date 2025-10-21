let x, y;
let x1, y1;

function setup() {
  createCanvas(windowWidth, windowHeight);
x = width * 0.5;
y = height * 0.5;
x1 = width * 0.5;
y1 = height * 0.5;
background(220);
noFill();
}
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function draw() {
    background(220);
// add a little wiggle to the circle's position
    x += random(-1, 1);
    y += random(-1, 1);
    circle(x, y, 50);
// create a second circle with a 10,10 offset
    circle(x1, y1);
print(x);
}   

function mousePressed() {
    x = mouseX;
    y = mouseY;
    x1 = mouseX;
    y1 = mouseY;   
}