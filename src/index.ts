import * as auth0 from 'auth0'
import { wrap } from 'async-middleware'
import * as crypto from 'crypto'
import * as express from 'express'
import * as HttpStatus from 'http-status-codes'
import * as knex from 'knex'
import { MarshalFrom } from 'raynor'

import { isLocal } from '@neoncity/common-js'
import { newAuthInfoMiddleware, newCorsMiddleware, newRequestTimeMiddleware, startupMigration } from '@neoncity/common-server-js'
import { Role, UserResponse, User, UserEventsResponse, UserEvent, UserEventType, UserState } from '@neoncity/identity-sdk-js'

import * as config from './config'


import { IdentityRequest } from './identity-request'
import { newAuth0Middleware } from './auth0-middleware'

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
    
    const userResponseMarshaller = new (MarshalFrom(UserResponse))();
    const userEventsResponseMarshaller = new (MarshalFrom(UserEventsResponse))();    

    const userFields = [
        'identity.user.id as user_id',
        'identity.user.state as user_state',
        'identity.user.role as user_role',
        'identity.user.auth0_user_id_hash as user_auth0_user_id_hash',
        'identity.user.time_created as user_time_created',
        'identity.user.time_last_updated as user_time_last_updated',
        'identity.user.time_removed as user_time_removed'
    ];

    const userEventFields = [
        'identity.user_event.id as user_event_id',
        'identity.user_event.type as user_event_type',
        'identity.user_event.timestamp as user_event_timestamp',
        'identity.user_event.data as user_event_data'
    ];

    app.use(newRequestTimeMiddleware());
    app.use(newCorsMiddleware(config.CLIENTS));
    app.use(newAuthInfoMiddleware());
    app.use(newAuth0Middleware(config.ENV, auth0Client));

    app.get('/user', wrap(async (req: IdentityRequest, res: express.Response) => {
	// Compute hash of user_id.
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(req.auth0Profile.userId);
	const auth0UserIdHash = sha256hash.digest('hex');

	// Lookup id hash in database
	let dbUser: any|null = null;
	try {
	    const dbUsers = await conn('identity.user')
		  .select(userFields)
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
	    dbUser['user_id'],
            dbUser['user_state'],
	    dbUser['user_role'],
	    auth0UserIdHash,
	    new Date(dbUser['user_time_created']),
	    new Date(dbUser['user_time_last_updated']),
	    req.auth0Profile.name,
	    req.auth0Profile.picture);

        const userResponse = new UserResponse();
        userResponse.user = user;
	
        res.write(JSON.stringify(userResponseMarshaller.pack(userResponse)));
        res.end();
    }));

    app.post('/user', wrap(async (req: IdentityRequest, res: express.Response) => {
	// Compute hash of user_id.
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(req.auth0Profile.userId);
	const auth0UserIdHash = sha256hash.digest('hex');

	// Insert in database
	let dbUserId: number = -1;
	try {
            await conn.transaction(async (trx) => {
	        const rawResponse = await trx.raw(`
                    insert into identity.user (state, role, auth0_user_id_hash, time_created, time_last_updated)
                    values (?, ?, ?, ?, ?)
	            on conflict (auth0_user_id_hash) do update set time_last_updated = excluded.time_last_updated 
		    returning id, time_created, time_last_updated`,
                    [UserState.ActiveAndLinkedWithAuth0, Role.Regular, auth0UserIdHash, req.requestTime, req.requestTime])

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
                          'data': null,
                          'user_id': dbUserId
                      });

                if (dbUserEventIds.length == 0) {
                    throw new Error('Failed to insert creation event');
                }
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
            UserState.ActiveAndLinkedWithAuth0,
	    Role.Regular,
	    auth0UserIdHash,
	    req.requestTime,
	    req.requestTime,
	    req.auth0Profile.name,
	    req.auth0Profile.picture);
	
        const userResponse = new UserResponse();
        userResponse.user = user;
	
        res.write(JSON.stringify(userResponseMarshaller.pack(userResponse)));
        res.end();
    }));

    app.get('/user/events', wrap(async (req: IdentityRequest, res: express.Response) => {
	// Compute hash of user_id.
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(req.auth0Profile.userId);
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
                .select(userEventFields)
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
            userEvent.id = dbUE['user_event_id'];
            userEvent.type = dbUE['user_event_type'];
            userEvent.timestamp = dbUE['user_event_timestamp'];
            userEvent.data = dbUE['user_event_data'];
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
