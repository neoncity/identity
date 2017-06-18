import * as auth0 from 'auth0'
import { wrap } from 'async-middleware'
import * as compression from 'compression'
import * as express from 'express'
import * as HttpStatus from 'http-status-codes'
import * as knex from 'knex'
import { MarshalFrom } from 'raynor'

import { isLocal } from '@neoncity/common-js'
import {
    AuthInfoLevel,
    newAuthInfoMiddleware,
    newCheckOriginMiddleware,
    newCheckXsrfTokenMiddleware,
    newCorsMiddleware,
    newJsonContentMiddleware,
    newRequestTimeMiddleware,
    startupMigration } from '@neoncity/common-server-js'
import { AuthInfo, AuthInfoAndSessionResponse, SessionResponse } from '@neoncity/identity-sdk-js'

import { Auth0Profile } from './auth0-profile'
import { IdentityRequest } from './identity-request'
//import { newAuth0Middleware } from './auth0-middleware'
import * as config from './config'
import { Repository } from './repository'

async function main() {
    startupMigration();

    const app = express();
    const auth0Client = new auth0.AuthenticationClient({
    	clientId: config.AUTH0_CLIENT_ID,
    	domain: config.AUTH0_DOMAIN
    });
    const conn = knex({
        client: 'pg',
    	connection: process.env.DATABASE_URL
    });
    const repository = new Repository(conn);

    const auth0ProfileMarshaller = new (MarshalFrom(Auth0Profile))();
    const authInfoAndSessionResponseMarshaller = new (MarshalFrom(AuthInfoAndSessionResponse))();
    const sessionResponseMarshaller = new (MarshalFrom(SessionResponse))();

    app.use(newRequestTimeMiddleware());
    app.use(newCorsMiddleware(config.CLIENTS, ['POST', 'GET', 'DELETE'], []));
    app.use(newCheckOriginMiddleware(config.CLIENTS));
    app.use(newJsonContentMiddleware());

    if (!isLocal(config.ENV)) {
        app.use(compression());
    }

    app.post('/session', newAuthInfoMiddleware(AuthInfoLevel.None), wrap(async (req: IdentityRequest, res: express.Response) => {
	try {
	    const [authInfo, session, created] = await repository.getOrCreateSession(req.authInfo, req.requestTime);

    	    const authInfoAndSessionResponse = new AuthInfoAndSessionResponse();
	    authInfoAndSessionResponse.authInfo = authInfo;
    	    authInfoAndSessionResponse.session = session;

    	    res.write(JSON.stringify(authInfoAndSessionResponseMarshaller.pack(authInfoAndSessionResponse)));
    	    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    	    res.end();
	} catch (e) {
	    console.log(`DB insertion error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }
                        
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	}
    }));

    app.get('/session', newAuthInfoMiddleware(AuthInfoLevel.SessionId), wrap(async (req: IdentityRequest, res: express.Response) => {
	try {
	    const session = await repository.getSession(req.authInfo as AuthInfo, req.requestTime);
	    
	    const sessionResponse = new SessionResponse();
    	    sessionResponse.session = session;

    	    res.write(JSON.stringify(sessionResponseMarshaller.pack(sessionResponse)));
    	    res.status(HttpStatus.OK);
    	    res.end();
	} catch (e) {
	    if (e.name == 'SessionNotFoundError') {
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
	    }
	    
	    console.log(`DB insertion error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }
                        
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	}
    }));

    app.delete('/session', [
        newAuthInfoMiddleware(AuthInfoLevel.SessionId),
        newCheckXsrfTokenMiddleware(true)
    ], wrap(async (req: IdentityRequest, res: express.Response) => {
	try {
	    await repository.expireSession(req.authInfo as AuthInfo, req.requestTime, req.xsrfToken as string);

    	    res.status(HttpStatus.NO_CONTENT);
    	    res.end();
	} catch (e) {
	    if (e.name == 'SessionNotFoundError') {
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
	    }

	    if (e.name == 'XsrfTokenMismatchError') {
		res.status(HttpStatus.BAD_REQUEST);
		res.end();
		return;
	    }            
	    
	    console.log(`DB insertion error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }
                        
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	}
    }));

    app.post('/user', [
        newAuthInfoMiddleware(AuthInfoLevel.SessionIdAndAuth0AccessToken),
        newCheckXsrfTokenMiddleware(true)
    ], wrap(async (req: IdentityRequest, res: express.Response) => {
	let auth0Profile: Auth0Profile|null = null;
	try {
	    const auth0AccessToken = (req.authInfo as AuthInfo).auth0AccessToken as string;
	    const auth0ProfileSerialized = await auth0Client.getProfile(auth0AccessToken);

	    if (auth0ProfileSerialized == 'Unauthorized') {
		console.log('Token was not accepted by Auth0');
		res.status(HttpStatus.UNAUTHORIZED);
		res.end();
		return;
	    }
	    
	    auth0Profile = auth0ProfileMarshaller.extract(JSON.parse(auth0ProfileSerialized));
	} catch (e) {
	    console.log(`Auth0 error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }
            
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	try {
	    const [authInfo, session, created] = await repository.getOrCreateUserOnSession(req.authInfo as AuthInfo, auth0Profile, req.requestTime, req.xsrfToken as string);

    	    const authInfoAndSessionResponse = new AuthInfoAndSessionResponse();
	    authInfoAndSessionResponse.authInfo = authInfo;
    	    authInfoAndSessionResponse.session = session;

    	    res.write(JSON.stringify(authInfoAndSessionResponseMarshaller.pack(authInfoAndSessionResponse)));
    	    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    	    res.end();
	} catch (e) {
	    if (e.name == 'SessionNotFoundError') {
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
	    }

	    if (e.name == 'XsrfTokenMismatchError') {
		res.status(HttpStatus.BAD_REQUEST);
		res.end();
		return;
	    }            
	    
	    console.log(`DB insertion error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }

	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	}
    }));

    app.get('/user', newAuthInfoMiddleware(AuthInfoLevel.SessionIdAndAuth0AccessToken), wrap(async (req: IdentityRequest, res: express.Response) => {
	let auth0Profile: Auth0Profile|null = null;	
	try {
	    const auth0AccessToken = (req.authInfo as AuthInfo).auth0AccessToken as string;
	    const auth0ProfileSerialized = await auth0Client.getProfile(auth0AccessToken);

	    if (auth0ProfileSerialized == 'Unauthorized') {
		console.log('Token was not accepted by Auth0');
		res.status(HttpStatus.UNAUTHORIZED);
		res.end();
		return;
	    }
	    
	    auth0Profile = auth0ProfileMarshaller.extract(JSON.parse(auth0ProfileSerialized));
	} catch (e) {
	    console.log(`Auth0 error - ${e.toString()}`);
	    if (isLocal(config.ENV)) {
                console.log(e);
	    }
	    
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	try {
	    const session = await repository.getUserOnSession(req.authInfo as AuthInfo, auth0Profile, req.requestTime);
	    
	    const sessionResponse = new SessionResponse();
    	    sessionResponse.session = session;

    	    res.write(JSON.stringify(sessionResponseMarshaller.pack(sessionResponse)));
    	    res.status(HttpStatus.CREATED);
    	    res.end();
	} catch (e) {
	    if (e.name == 'UserNotFoundError') {
		console.log(`User not found - ${e.message}`);
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
	    }

	    if (e.name == 'SessionNotFoundError') {
		console.log(`Session not found - ${e.message}`);
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
	    }
	    
	    console.log(`DB insertion error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }
                        
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	}
    }));

    app.listen(config.PORT, config.ADDRESS, () => {
	console.log(`Started identity service on ${config.ADDRESS}:${config.PORT}`);
    });
}


main();
