import { readFileSync } from 'fs';

import { Env, parseEnv, isLocal} from '@neoncity/common-js/env';

export const ENV:Env = parseEnv(process.env.ENV);
export const ADDRESS:string = process.env.ADDRESS;
export const PORT:number = parseInt(process.env.PORT, 10);
export const DATABASE_URL:string = process.env.DATABASE_URL;
export const DATABASE_MIGRATIONS_DIR:string = './migrations';
export const DATABASE_MIGRATIONS_TABLE:string = 'migrations_identity';

export let THE_KEY: string;

if (isLocal(ENV)) {
    const secrets = JSON.parse(readFileSync(process.env.SECRETS_PATH, 'utf-8'));

    THE_KEY = secrets["THE_KEY"];
} else {
    THE_KEY = process.env.THE_KEY;
}
