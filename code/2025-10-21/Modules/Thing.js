class Things {
    // create a draw method
    draw() {
        push();
        translate(this.x || 0, this.y || 0);
        stroke(0);
        for (let i = 0; i < (this.values || []).length; i++) {
            const sx = map(i, 0, this.values.length - 1, 0, width * 0.25);
            const sy = this.values[i];
            line(sx, 0, sx, -sy);
        }
        pop();
    }

    // static factory to create and initialize instances (no constructor, no init())
    static create(x, y) {
        const t = new Things();
        t.x = x;
        t.y = y;
        t.values = [100];
        for (let i = 0; i < 100; i++) {
            t.values.push(random(height));
        }
        return t;
    }
}