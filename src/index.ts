import * as express from 'express';
import { execSync } from 'child_process';
import fetch = require('isomorphic-fetch');

import * as config from './config';
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

console.log(FOO);


async function main() {
    execSync('./node_modules/.bin/knex migrate:latest');

    const app = express();

    app.get('/hello', async (_: express.Request, res: express.Response) => {
	console.log(`I've found ${config.THE_KEY}`);
        const resp = await fetch('http://example.com');
        const content = await resp.text();
        res.write(content);
        res.end();
    });

    app.get('/user', async (_: express.Request, res: express.Response) => {
        res.write(JSON.stringify({user: {id: 1, timeCreated: 123151131, timeLastUpdated: 123151131, role: 1, auth0UserIdHash: '0000000000000000000000000000000000000000000000000000000000000000', pictureUri: 'http://example.com/a.jpeg'}}));
        res.end();
    });

    app.listen(config.PORT, config.ADDRESS, () => {
	console.log(`Started ... ${config.ADDRESS}:${config.PORT}`);
    });
}

main();
