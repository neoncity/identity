import * as auth0 from 'auth0'
import { wrap } from 'async-middleware'
import * as crypto from 'crypto'
import * as express from 'express'
import * as HttpStatus from 'http-status-codes'
import * as knex from 'knex'
import { MarshalFrom, MarshalWith } from 'raynor'
import * as r from 'raynor'

import { isLocal } from '@neoncity/common-js/env'
import { newAuthInfoMiddleware, newCorsMiddleware, newRequestTimeMiddleware, Request, startupMigration } from '@neoncity/common-server-js'
import { Role, UserResponse, User, UserEventsResponse, UserEvent, UserEventType } from '@neoncity/identity-sdk-js'

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
    const userResponseMarshaller = new (MarshalFrom(UserResponse))();
    const userEventsResponseMarshaller = new (MarshalFrom(UserEventsResponse))();    

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
            if (isLocal(config.ENV)) {
                console.log(e);
            }
            
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
            if (isLocal(config.ENV)) {
                console.log(e);
            }
            
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	// Return joined value from auth0 and db

	const user = new User(
	    dbUser['id'],
	    new Date(dbUser['time_created']),
	    new Date(dbUser['time_last_updated']),
	    dbUser['role'],
	    auth0UserIdHash,
	    userProfile.name,
	    userProfile.picture);

        const userResponse = new UserResponse();
        userResponse.user = user;
	
        res.write(JSON.stringify(userResponseMarshaller.pack(userResponse)));
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
            if (isLocal(config.ENV)) {
                console.log(e);
            }
            
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
        let dbUserEventId: number = -1;
	try {
            await conn.transaction(async (trx) => {
	        const rawResponse = await trx.raw(`
		    insert into identity.user (time_created, time_last_updated, role, auth0_user_id_hash)
                    values (?, ?, ?, ?)
	            on conflict (auth0_user_id_hash) do update set time_last_updated = excluded.time_last_updated 
		    returning id, time_created, time_last_updated`,
  		    [req.requestTime, req.requestTime, Role.Regular, auth0UserIdHash])

	        if (rawResponse.rowCount == 0) {
		    console.log('BD insertion error');
	    	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    	    res.end();
	    	    return;
	        }

	        dbUserId = rawResponse.rows[0]['id'];

                const eventType = rawResponse.rows[0]['time_created'] == rawResponse.rows[0]['time_last_updated']
                      ? UserEventType.Created
                      : UserEventType.Recreated;

                const dbUserEventIds = await trx
                      .from('identity.user_event')
                      .returning('id')
                      .insert({
                          'type': eventType,
                          'timestamp': req.requestTime,
                          'data': 'null',
                          'user_id': dbUserId
                      });

                if (dbUserEventIds.length == 0) {
                    throw new Error('Failed to insert creation event');
                }

                dbUserEventId = dbUserEventIds[0];
            });
	} catch (e) {
	    console.log(`DB insertion error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }
                        
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
	
        const userResponse = new UserResponse();
        userResponse.user = user;
	
        res.write(JSON.stringify(userResponseMarshaller.pack(userResponse)));
        res.end();
    }));

    app.get('/user/events', wrap(async (req: Request, res: express.Response) => {
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
            if (isLocal(config.ENV)) {
                console.log(e);
            }
            
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	// Compute hash of user_id.
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(userProfile.user_id);
	const auth0UserIdHash = sha256hash.digest('hex');

	// Lookup id hash in database
        let dbUserEvents: any[]|null = null;
	try {
	    const dbUsers = await conn('identity.user')
		  .select(['id'])
		  .where({auth0_user_id_hash: auth0UserIdHash})
		  .limit(1);

	    if (dbUsers.length == 0) {
		console.log('User does not exist');
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
	    }

	    const dbUserId = dbUsers[0]['id'];

            dbUserEvents = await conn('identity.user_event')
                .select([
                    'id',
                    'type',
                    'timestamp',
                    'data'])
                .where({user_id: dbUserId})
                .orderBy('timestamp', 'asc') as any[];

            if (dbUserEvents.length == 0) {
		console.log('User does not have any events');
		res.status(HttpStatus.NOT_FOUND);
		res.end();
		return;
            }
	} catch (e) {
	    console.log(`DB retrieval error - ${e.toString()}`);
            if (isLocal(config.ENV)) {
                console.log(e);
            }
            
	    res.status(HttpStatus.INTERNAL_SERVER_ERROR);
	    res.end();
	    return;
	}

	// Return joined value from auth0 and db

        const userEvents = dbUserEvents.map(dbUE => {
            const userEvent = new UserEvent();
            userEvent.id = dbUE['id'];
            userEvent.type = dbUE['type'];
            userEvent.timestamp = dbUE['timestamp'];
            userEvent.data = dbUE['data'];
            return userEvent;
        });

        const userEventsResponse = new UserEventsResponse();
        userEventsResponse.events = userEvents;
	
        res.write(JSON.stringify(userEventsResponseMarshaller.pack(userEventsResponse)));
        res.end();
    }));    

    app.listen(config.PORT, config.ADDRESS, () => {
	console.log(`Started identity service on ${config.ADDRESS}:${config.PORT}`);
    });
}


main();
