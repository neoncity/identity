import { readFileSync } from 'fs';

import { Env, parseEnv, isLocal} from '@neoncity/common-js/env';

export const ENV:Env = parseEnv(process.env.ENV);
export const ADDRESS:string = process.env.ADDRESS;
export const PORT:number = parseInt(process.env.PORT, 10);
export const DATABASE_URL:string = process.env.DATABASE_URL;
export const DATABASE_MIGRATIONS_DIR:string = process.env.DATABASE_MIGRATIONS_DIR;
export const DATABASE_MIGRATIONS_TABLE:string = process.env.DATABASE_MIGRATIONS_TABLE;
export const CLIENTS:string = process.env.CLIENTS;

export let AUTH0_CLIENT_ID: string;
export let AUTH0_DOMAIN: string;

if (isLocal(ENV)) {
    const secrets = JSON.parse(readFileSync(process.env.SECRETS_PATH, 'utf-8'));

    AUTH0_CLIENT_ID = secrets["AUTH0_CLIENT_ID"];
    AUTH0_DOMAIN = secrets["AUTH0_DOMAIN"];
} else {
    AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
    AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
}
