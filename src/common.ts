export enum Env {
    Local,
    Test,
    Staging,
    Prod
}

export function parseEnv(env: string): Env {
    switch (env.toUpperCase()) {
    case "LOCAL":
        return Env.Local;
    case "TEST":
        return Env.Test;
    case "Staging":
        return Env.Staging;
    case "Prod":
        return Env.Prod;
    default:
        throw new Error(`Invalid environment ${env}`);
    }
}

export const isLocal = (env: Env):boolean => env == Env.Local;
