import { expect } from 'chai'
import 'mocha'

import { Env, parseEnv, isLocal} from '../src/common'

describe('Env', () => {
    describe('parseEnv', () => {
        it ('should parse local', () => {
            expect(parseEnv('LOCAL')).to.equal(Env.Local);
            expect(parseEnv('local')).to.equal(Env.Local);
            expect(parseEnv('lOcAl')).to.equal(Env.Local);
        });

        it ('should parse test', () => {
            expect(parseEnv('TEST')).to.equal(Env.Test);
            expect(parseEnv('test')).to.equal(Env.Test);
            expect(parseEnv('tEsT')).to.equal(Env.Test);
        });

        it ('should parse staging', () => {
            expect(parseEnv('STAGING')).to.equal(Env.Staging);
            expect(parseEnv('staging')).to.equal(Env.Staging);
            expect(parseEnv('sTaGiNg')).to.equal(Env.Staging);
        });

        it ('should parse prod', () => {
            expect(parseEnv('PROD')).to.equal(Env.Prod);
            expect(parseEnv('prod')).to.equal(Env.Prod);
            expect(parseEnv('pRoD')).to.equal(Env.Prod);
        });

        it ('should throw on undefined', () => {
            expect(() => parseEnv(undefined)).to.throw('Environment is not defined');
        });

        it ('should throw on unknown environment', () => {
            expect(() => parseEnv('DEV')).to.throw('Invalid environment DEV');
        });
    });

    describe('isLocal', () => {
        it ('should recognize local as local', () => {
            expect(isLocal(Env.Local)).to.be.true;
        });

        it ('should recognize test as non-local', () => {
            expect(isLocal(Env.Test)).to.be.false;
        });

        it ('should recognize staging as non-local', () => {
            expect(isLocal(Env.Staging)).to.be.false;
        });

        it ('should recognize prod as non-local', () => {
            expect(isLocal(Env.Prod)).to.be.false;
        });
    });
});
