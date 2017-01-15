export enum Env {
    Local,
    Test,
    Staging,
    Prod
}

export function parseEnv(env: string|undefined): Env {
    if (env === undefined)
        throw new Error('Environment is not defined');
        
    switch (env.toUpperCase()) {
    case "LOCAL":
        return Env.Local;
    case "TEST":
        return Env.Test;
    case "STAGING":
        return Env.Staging;
    case "PROD":
        return Env.Prod;
    default:
        throw new Error(`Invalid environment ${env}`);
    }
}

export const isLocal = (env: Env):boolean => env == Env.Local;
