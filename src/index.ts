//import * as auth0 from 'auth0'
import { wrap } from 'async-middleware'
import * as express from 'express'
import * as HttpStatus from 'http-status-codes'
import * as knex from 'knex'
import { MarshalFrom } from 'raynor'

import { isLocal } from '@neoncity/common-js'
import {
    AuthInfoLevel,
    newAuthInfoMiddleware,
    newCorsMiddleware,
    newRequestTimeMiddleware,
    startupMigration } from '@neoncity/common-server-js'
import { SessionResponse } from '@neoncity/identity-sdk-js'

import * as config from './config'

import { IdentityRequest } from './identity-request'
//import { newAuth0Middleware } from './auth0-middleware'
import { Repository } from './repository'


async function main() {
    startupMigration();

    const app = express();
    // const auth0Client = new auth0.AuthenticationClient({
    // 	clientId: config.AUTH0_CLIENT_ID,
    // 	domain: config.AUTH0_DOMAIN
    // });
    const conn = knex({
        client: 'pg',
    	connection: process.env.DATABASE_URL
    });
    const repository = new Repository(conn);

    const sessionResponseMarshaller = new (MarshalFrom(SessionResponse))();

    app.use(newRequestTimeMiddleware());
    app.use(newCorsMiddleware(config.CLIENTS));    

    app.post('/session', newAuthInfoMiddleware(AuthInfoLevel.None), wrap(async (req: IdentityRequest, res: express.Response) => {
	try {
	    const session = await repository.getOrCreateSession(req.authInfo, req.requestTime);

    	    const sessionResponse = new SessionResponse();
    	    sessionResponse.session = session;

    	    res.write(JSON.stringify(sessionResponseMarshaller.pack(sessionResponse)));
    	    res.status(HttpStatus.CREATED);
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

    app.post('/session/user', newAuthInfoMiddleware(AuthInfoLevel.SessionIdAndAuth0AccessToken), wrap(async (req: IdentityRequest, res: express.Response) => {
	let auth0Profile: Auth0Profile|null = null;
	try {
	    const auth0ProfileSerialized = await auth0Client.getProfile(req.authInfo.auth0AccessToken as string);

	    if (auth0ProfileSerialized == 'Unauthorized') {
		console.log('Token was not accepted by Auth0');
		res.status(HttpStatus.UNAUTHORIZED);
		res.end();
		return;
	    }
	    
	    auth0Profile = auth0ProfileMarshaller.extract(JSON.parse(auth0ProfileSerialized));
	} catch (e) {
	    console.log(`Auth0 error - ${e.toString()}`);
            if (isLocal(env)) {
                console.log(e);
            }
            
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	try {
	    const session = await repository.getOrCreateUserOnSession(req.authInfo, auth0Profile, req.requestTime);

    	    const sessionResponse = new SessionResponse();
    	    sessionResponse.session = session;

    	    res.write(JSON.stringify(sessionResponseMarshaller.pack(sessionResponse)));
    	    res.status(HttpStatus.CREATED);
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



    // const sessionsRouter = express.Router();

    // sessionsRouter.post('/', wrap(async (req: IdentityRequest, res: express.Response) => {
    // 	try {
    // 	    console.log(req.headers['Cookie']);
    // 	    const session = await repository.createSession(req.requestTime);

    // 	    const sessionResponse = new SessionResponse();
    // 	    sessionResponse.session = session;

    // 	    res.write(JSON.stringify(sessionResponseMarshaller.pack(sessionResponse)));
    // 	    res.status(HttpStatus.CREATED);
    // 	    res.end();
    // 	} catch (e) {
    // 	    console.log(`DB insertion error - ${e.toString()}`);
    //         if (isLocal(config.ENV)) {
    //             console.log(e);
    //         }
                        
    // 	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
    // 	    res.end();
    // 	}
    // }));

    // sessionsRouter.get('/:sessionId', wrap(async (req: IdentityRequest, res: express.Response) => {
    // 	let sessionId: string|null = null;
    // 	try {
    // 	    sessionId = uuidMarshaller.extract(req.params['sessionId']);
    // 	} catch (e) {
    // 	    console.log('Invalid session id');
    // 	    res.status(HttpStatus.BAD_REQUEST);
    // 	    res.end();
    // 	    return;
    // 	}
	
    // 	try {
    // 	    const session = await repository.getSession(sessionId, req.requestTime);

    //         const sessionResponse = new SessionResponse();
    //         sessionResponse.session = session;
	
    //         res.write(JSON.stringify(sessionResponseMarshaller.pack(sessionResponse)));
    // 	    res.status(HttpStatus.OK);
    //         res.end();
    // 	} catch (e) {
    // 	    if (e.name == 'SessionNotFoundError') {
    // 		console.log(e.message);
    // 		res.status(HttpStatus.NOT_FOUND);
    // 		res.end();
    // 		return;
    // 	    }
	    
    // 	    console.log(`DB retrieval error - ${e.toString()}`);
    // 	    if (isLocal(config.ENV)) {
    //             console.log(e);
    // 	    }
	    
    // 	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
    // 	    res.end();
    // 	}
    // }));

    // const usersRouter = express.Router();

    // usersRouter.use(newAuthInfoMiddleware());
    // usersRouter.use(newAuth0Middleware(config.ENV, auth0Client));

    // usersRouter.post('/', wrap(async (req: IdentityRequest, res: express.Response) => {
    // 	try{
    // 	    const user = await repository.createUser(req.auth0Profile, req.requestTime);

    //         const userResponse = new UserResponse();
    //         userResponse.user = user;
	    
    //         res.write(JSON.stringify(userResponseMarshaller.pack(userResponse)));
    // 	    res.status(HttpStatus.CREATED);
    //         res.end();
    // 	} catch (e) {
    // 	    console.log(`DB insertion error - ${e.toString()}`);
    //         if (isLocal(config.ENV)) {
    //             console.log(e);
    //         }
                        
    // 	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
    // 	    res.end();	    
    // 	}
    // }));    

    // usersRouter.get('/', wrap(async (req: IdentityRequest, res: express.Response) => {
    // 	try {
    // 	    const user = await repository.getUser(req.auth0Profile);

    //         const userResponse = new UserResponse();
    //         userResponse.user = user;
	
    //         res.write(JSON.stringify(userResponseMarshaller.pack(userResponse)));
    // 	    res.status(HttpStatus.OK);
    //         res.end();
    // 	} catch (e) {
    // 	    if (e.name == 'UserNotFoundError') {
    // 		console.log(e.message);
    // 		res.status(HttpStatus.NOT_FOUND);
    // 		res.end();
    // 		return;
    // 	    }
	    
    // 	    console.log(`DB retrieval error - ${e.toString()}`);
    // 	    if (isLocal(config.ENV)) {
    //             console.log(e);
    // 	    }
	    
    // 	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
    // 	    res.end();
    // 	}
    // }));

    // usersRouter.get('/event', wrap(async (req: IdentityRequest, res: express.Response) => {
    // 	try {
    // 	    const userEvents = await repository.getUserEvents(req.auth0Profile);

    // 	    const userEventsResponse = new UserEventsResponse();
    //         userEventsResponse.events = userEvents;
	    
    //         res.write(JSON.stringify(userEventsResponseMarshaller.pack(userEventsResponse)));
    // 	    res.status(HttpStatus.OK);
    //         res.end();
    // 	} catch (e) {
    // 	    if (e.name == 'UserNotFoundError') {
    // 		console.log(e.message);
    // 		res.status(HttpStatus.NOT_FOUND);
    // 		res.end();
    // 		return;
    // 	    }
	    
    // 	    console.log(`DB retrieval error - ${e.toString()}`);
    // 	    if (isLocal(config.ENV)) {
    //             console.log(e);
    // 	    }
	    
    // 	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
    // 	    res.end();
    // 	}
    // }));

    // app.use('/session', sessionsRouter);
    // app.use('/user', usersRouter);

    app.listen(config.PORT, config.ADDRESS, () => {
	console.log(`Started identity service on ${config.ADDRESS}:${config.PORT}`);
    });
}


main();
