import * as auth0 from 'auth0'
import { wrap } from 'async-middleware'
import * as crypto from 'crypto'
import * as express from 'express'
import * as HttpStatus from 'http-status-codes'
import * as knex from 'knex'
import { MarshalFrom, MarshalWith } from 'raynor'
import * as r from 'raynor'

import { newAuthInfoMiddleware, newCorsMiddleware, newRequestTimeMiddleware, Request, startupMigration } from '@neoncity/common-server-js'
import { Role, IdentityResponse, User } from '@neoncity/identity-sdk-js'

import * as config from './config'


class Auth0Profile {
    @MarshalWith(r.StringMarshaller)
    name: string;

    @MarshalWith(r.UriMarshaller)
    picture: string;

    @MarshalWith(r.StringMarshaller)
    user_id: string;
}


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
    
    const auth0ProfileMarshaller = new (MarshalFrom(Auth0Profile))();
    const identityResponseMarshaller = new (MarshalFrom(IdentityResponse))();

    app.use(newRequestTimeMiddleware());
    app.use(newCorsMiddleware(config.CLIENTS));
    app.use(newAuthInfoMiddleware());

    app.get('/user', wrap(async (req: Request, res: express.Response) => {
	if (req.authInfo == null) {
	    console.log('No authInfo');
	    res.status(HttpStatus.BAD_REQUEST);
	    res.end();
	    return;
	}

	// Make a call to auth0
	let userProfile: Auth0Profile|null = null;
	try {
	    const userProfileSerialized = await auth0Client.getProfile(req.authInfo.auth0AccessToken);

	    if (userProfileSerialized == 'Unauthorized') {
		console.log('Token was not accepted by Auth0');
		res.status(HttpStatus.UNAUTHORIZED);
		res.end();
		return;
	    }
	    
	    userProfile = auth0ProfileMarshaller.extract(JSON.parse(userProfileSerialized));
	} catch (e) {
	    console.log(`Auth0 error - ${e.toString()}`);
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	// Compute hash of user_id.
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(userProfile.user_id);
	const auth0UserIdHash = sha256hash.digest('hex');

	// Lookup id hash in database
	let dbUser: any|null = null;
	try {
	    const dbUsers = await conn('identity.user')
		  .select([
		      'id',
		      'time_created',
		      'time_last_updated',
		      'time_removed',
		      'role',
		      'auth0_user_id_hash'])
		  .where({auth0_user_id_hash: auth0UserIdHash})
		  .limit(1);

	    if (dbUsers.length == 0) {
		console.log('User does not exist');
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
	    }

	    dbUser = dbUsers[0];
	} catch (e) {
	    console.log(`DB retrieval error - ${e.toString()}`);
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	// Return joined value from auth0 and db

	const user = new User(
	    dbUser['id'],
	    new Date(dbUser['time_created']),
	    new Date(dbUser['time_last_updated']),
	    _dbRoleToRole(dbUser['role']),
	    auth0UserIdHash,
	    userProfile.name,
	    userProfile.picture);

        const identityResponse = new IdentityResponse();
        identityResponse.user = user;
	
        res.write(JSON.stringify(identityResponseMarshaller.pack(identityResponse)));
        res.end();
    }));

    app.post('/user', wrap(async (req: Request, res: express.Response) => {
	if (req.authInfo == null) {
	    console.log('No authInfo');
	    res.status(HttpStatus.BAD_REQUEST);
	    res.end();
	    return;
	}

	// Make a call to auth0
	let userProfile: Auth0Profile|null = null;
	try {
	    const userProfileSerialized = await auth0Client.getProfile(req.authInfo.auth0AccessToken);

	    if (userProfileSerialized == 'Unauthorized') {
		console.log('Token was not accepted by Auth0');		
		res.status(HttpStatus.UNAUTHORIZED);
		res.end();
		return;
	    }
	    
	    userProfile = auth0ProfileMarshaller.extract(JSON.parse(userProfileSerialized));
	} catch (e) {
	    console.log(`Auth0 error - ${e.toString()}`);	    
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	// Compute hash of user_id.
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(userProfile.user_id);
	const auth0UserIdHash = sha256hash.digest('hex');

	// Insert in database
	let dbUserId: number = -1;
	try {
	    const rawResponse = await conn.raw(`
		insert into identity.user (time_created, time_last_updated, role, auth0_user_id_hash)
		values (?, ?, ?, ?)
	        on conflict (auth0_user_id_hash) do update set time_last_updated = excluded.time_last_updated 
		returning id`,
		[req.requestTime, req.requestTime, _roleToDbRole(Role.Regular), auth0UserIdHash])

	    if (rawResponse.rowCount == 0) {
		console.log('BD insertion error');
	    	res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    	res.end();
	    	return;
	    }

	    dbUserId = rawResponse.rows[0]['id'];
	} catch (e) {
	    console.log(`DB insertion error - ${e.toString()}`);
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	// Return joined value from auth0 and db

	const user = new User(
	    dbUserId,
	    req.requestTime,
	    req.requestTime,
	    Role.Regular,
	    auth0UserIdHash,
	    userProfile.name,
	    userProfile.picture);
	
        const identityResponse = new IdentityResponse();
        identityResponse.user = user;
	
        res.write(JSON.stringify(identityResponseMarshaller.pack(identityResponse)));
        res.end();
    }));

    app.listen(config.PORT, config.ADDRESS, () => {
	console.log(`Started identity service on ${config.ADDRESS}:${config.PORT}`);
    });
}


function _roleToDbRole(role: Role): 'regular'|'admin' {
    switch (role) {
    case Role.Regular:
	return 'regular';
    case Role.Admin:
	return 'admin';
    case Role.Unknown:
    default:
	throw new Error('Invalid role');
    }
}


function _dbRoleToRole(dbRole: 'regular'|'admin'): Role {
    switch (dbRole) {
    case 'regular':
	return Role.Regular;
    case 'admin':
	return Role.Admin;
    }
}

main();
