import * as auth0 from 'auth0'
import { wrap } from 'async-middleware'
import * as express from 'express'
import * as HttpStatus from 'http-status-codes'
import { MarshalFrom } from 'raynor'

import { isLocal, Env } from '@neoncity/common-js'

import { Auth0Profile } from './auth0-profile'
import { IdentityRequest } from './identity-request'


export function newAuth0Middleware(env: Env, auth0Client: auth0.AuthenticationClient): express.RequestHandler {
    const auth0ProfileMarshaller = new (MarshalFrom(Auth0Profile))();
    
    return wrap(async (req: IdentityRequest, res: express.Response, next: express.NextFunction) => {
        console.log('here');
        if (req.authInfo == null) {
	    console.log('No authInfo');
	    res.status(HttpStatus.BAD_REQUEST);
	    res.end();
	    return;
	}

        // Make a call to auth0
	try {
	    const auth0ProfileSerialized = await auth0Client.getProfile(req.authInfo.auth0AccessToken as string);

	    if (auth0ProfileSerialized == 'Unauthorized') {
		console.log('Token was not accepted by Auth0');
		res.status(HttpStatus.UNAUTHORIZED);
		res.end();
		return;
	    }
	    
	    req.auth0Profile = auth0ProfileMarshaller.extract(JSON.parse(auth0ProfileSerialized));
	} catch (e) {
	    console.log(`Auth0 error - ${e.toString()}`);
            if (isLocal(env)) {
                console.log(e);
            }
            
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

        // Fire away.
        next();
    });
}
