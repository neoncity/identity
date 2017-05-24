import * as knex from 'knex'
import * as moment from 'moment'
import * as uuid from 'uuid'

import {
    Role,
    Session,
    SessionState,
    SessionEventType,
    User,
    UserEvent,
    UserEventType,
    UserState } from '@neoncity/identity-sdk-js'

import { Auth0Profile } from './auth0-profile'


export class RepositoryError extends Error {
    constructor(message: string) {
	super(message);
	this.name = 'RepositoryError';
    }
}


export class SessionNotFoundError extends RepositoryError {
    constructor(message: string) {
	super(message);
	this.name = 'SessionNotFoundError';
    }
}


export class UserNotFoundError extends RepositoryError {
    constructor(message: string) {
	super(message);
	this.name = 'UserNotFoundError';
    }
}



export class Repository {
    private static readonly _SESSION_MAX_LENGTH_IN_DAYS = 30;
    
    private static readonly _sessionFields = [
	'identity.session.id as session_id',
	'identity.session.state as session_state',
	'identity.session.time_expires as session_time_expires',
	'identity.session.time_created as session_time_created',
	'identity.session.time_last_updated as session_time_last_updated',
	'identity.session.time_removed as session_time_removed'
    ];    
    
    private static readonly _userFields = [
	'identity.user.id as user_id',
	'identity.user.state as user_state',
	'identity.user.role as user_role',
	'identity.user.auth0_user_id_hash as user_auth0_user_id_hash',
	'identity.user.time_created as user_time_created',
	'identity.user.time_last_updated as user_time_last_updated',
	'identity.user.time_removed as user_time_removed'
    ];

    private static readonly _userEventFields = [
        'identity.user_event.id as user_event_id',
        'identity.user_event.type as user_event_type',
        'identity.user_event.timestamp as user_event_timestamp',
        'identity.user_event.data as user_event_data'
    ];
    
    private readonly _conn: knex;

    constructor(conn: knex) {
	this._conn = conn;
    }

    async createSession(requestTime: Date): Promise<Session> {
	const sessionId = uuid();
	const timeExpires = moment(requestTime).add(Repository._SESSION_MAX_LENGTH_IN_DAYS, 'days').toDate();
	
	await this._conn.transaction(async (trx) => {
	    await trx
		  .from('identity.session')
		  .insert({
		      'id': sessionId,
		      'state': SessionState.Active,
		      'time_expires': timeExpires,
		      'user_id': null,
		      'time_created': requestTime,
		      'time_last_updated': requestTime,
		      'time_removed': null
		  });

	    await trx
		.from('identity.session_event')
		.insert({
		    'type': SessionEventType.Created,
		    'timestamp': requestTime,
		    'data': null,
		    'session_id': sessionId
		});
	});

	const session = new Session();
	session.id = sessionId;
	session.state = SessionState.Active;
	session.timeExpires = timeExpires;
	session.user = null;
	session.timeCreated = requestTime;
	session.timeLastUpdated = requestTime;

	return session;
    }

    async getSession(id: string, requestTime: Date): Promise<Session> {
	const dbSessions = await this._conn('identity.session')
	      .select(Repository._sessionFields)
	      .where({id: id, state: SessionState.Active})
	      .limit(1);

	if (dbSessions.length == 0) {
	    throw new SessionNotFoundError('Session does not exist');
	}

	const dbSession = dbSessions[0];

	const session = new Session();
	session.id = id;
	session.state = dbSession['session_state'];
	session.timeExpires = dbSession['session_time_expires'];
	session.user = null;
	session.timeCreated = dbSession['session_time_created'];
	session.timeLastUpdated = dbSession['session_time_last_updated'];

	if (requestTime > session.timeExpires) {
	    throw new SessionNotFoundError('Session does not exist');
	}

	return session;
    }

    async createUser(auth0Profile: Auth0Profile, requestTime: Date): Promise<User> {
	const userIdHash = auth0Profile.getUserIdHash();
	
	let dbUserId: number = -1;
	let dbUserTimeCreated: Date = new Date();
	
        await this._conn.transaction(async (trx) => {
	    const rawResponse = await trx.raw(`
                    insert into identity.user (state, role, auth0_user_id_hash, time_created, time_last_updated)
                    values (?, ?, ?, ?, ?)
	            on conflict (auth0_user_id_hash) do update set time_last_updated = excluded.time_last_updated, state=${UserState.Active}
		    returning id, time_created`,
	            [UserState.Active, Role.Regular, userIdHash, requestTime, requestTime]);

	    dbUserId = rawResponse.rows[0]['id'];
	    dbUserTimeCreated = rawResponse.rows[0]['time_created'];

            const eventType = rawResponse.rows[0]['time_created'] == rawResponse.rows[0]['time_last_updated']
                  ? UserEventType.Created
                  : UserEventType.Recreated;

            await trx
                  .from('identity.user_event')
                  .insert({
                      'type': eventType,
                      'timestamp': requestTime,
                      'data': null,
                      'user_id': dbUserId
                  });
	});

	return new User(
	    dbUserId,
            UserState.Active,
	    Role.Regular,
	    userIdHash,
	    dbUserTimeCreated,
	    requestTime,
	    auth0Profile.name,
	    auth0Profile.picture,
	    auth0Profile.language);
    }
    
    async getUser(auth0Profile: Auth0Profile): Promise<User> {
	const userIdHash = auth0Profile.getUserIdHash();
	
	// Lookup id hash in database
	const dbUsers = await this._conn('identity.user')
	      .select(Repository._userFields)
	      .where({auth0_user_id_hash: userIdHash, state: UserState.Active})
	      .limit(1);

	if (dbUsers.length == 0) {
	    throw new UserNotFoundError('User does not exist');
	}

	const dbUser = dbUsers[0];

	return new User(
	    dbUser['user_id'],
            dbUser['user_state'],
	    dbUser['user_role'],
	    userIdHash,
	    new Date(dbUser['user_time_created']),
	    new Date(dbUser['user_time_last_updated']),
	    auth0Profile.name,
	    auth0Profile.picture,
	    auth0Profile.language);
    }

    async getUserEvents(auth0Profile: Auth0Profile): Promise<UserEvent[]> {
	const userIdHash = auth0Profile.getUserIdHash();

	const dbUsers = await this._conn('identity.user')
	      .select(['id'])
	      .where({auth0_user_id_hash: userIdHash, state: UserState.Active})
	      .limit(1);

	if (dbUsers.length == 0) {
	    throw new UserNotFoundError('User does not exist');
	}

	const dbUserId = dbUsers[0]['id'];

        const dbUserEvents = await this._conn('identity.user_event')
              .select(Repository._userEventFields)
              .where({user_id: dbUserId})
              .orderBy('timestamp', 'asc') as any[];

        if (dbUserEvents.length == 0) {
	    throw new UserNotFoundError('User does not have any events');
        }

        return dbUserEvents.map(dbUE => {
            const userEvent = new UserEvent();
            userEvent.id = dbUE['user_event_id'];
            userEvent.type = dbUE['user_event_type'];
            userEvent.timestamp = dbUE['user_event_timestamp'];
            userEvent.data = dbUE['user_event_data'];
            return userEvent;
        });
    }
}
