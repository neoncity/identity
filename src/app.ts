import { FOO } from './second';

class Bar {
    X: number
    Y: number

    constructor(x: number, y: number) {
        this.X = x;
        this.Y = y;
    }

    toString(): string {
        return `X=${this.X} and Y=${this.Y}`;
    }
}

function foo(msg: string): void {
    console.log(msg);
}

foo("Hello");
foo("World");

const b = new Bar(10, 20);
console.log('' + b);

console.log(FOO)