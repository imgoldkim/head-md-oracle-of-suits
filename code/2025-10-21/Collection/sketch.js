// create a class called Planet
class Planet  {
  // create an x,y position
  constructor(x, y) {
    this.x = x;
    this.y = y;
    // create a random color for the planet
    this.color = color(random(255), random(255), random(255));
 }
// draw the planet as a circle-o3
  draw() {
    // wiggle the planet's position slightly
    this.x += random(-1, 1);
    this.y += random(-1, 1);
    //set the fill color to the planet's color
    fill(this.color);
    //no outline
    noStroke();
    ellipse(this.x, this.y, 50, 50);
 }
}

 // create a array to hold the planets
let planets = [];

  function setup() {
 // Create a canvas that fills the entire window
  createCanvas(windowWidth, windowHeight);
}

 function draw() {
 // white background
 // draw the planets
 for (let planet of planets) {
    planet.draw();
  }
}

 // when the mouse is dragged
function mouseDragged() {
  // create a new planet at the mouse position
  let newPlanet = new Planet(mouseX, mouseY);
  // add the new planet to the array
  planets.push(newPlanet);
}
