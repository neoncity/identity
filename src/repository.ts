import * as knex from 'knex'

import { Role, User, UserEvent, UserEventType, UserState } from '@neoncity/identity-sdk-js'

import { Auth0Profile } from './auth0-profile'


export class RepositoryError extends Error {
    constructor(message: string) {
	super(message);
	this.name = 'RepositoryError';
    }
}


export class UserNotFoundError extends RepositoryError {
    constructor(message: string) {
	super(message);
	this.name = 'UserNotFoundError';
    }
}



export class Repository {
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

    async createUser(auth0Profile: Auth0Profile, requestTime: Date): Promise<User> {
	const userIdHash = auth0Profile.getUserIdHash();
	
	let dbUserId: number = -1;
	let dbUserTimeCreated: Date = new Date();
	
        await this._conn.transaction(async (trx) => {
	    const rawResponse = await trx.raw(`
                    insert into identity.user (state, role, auth0_user_id_hash, time_created, time_last_updated)
                    values (?, ?, ?, ?, ?)
	            on conflict (auth0_user_id_hash) do update set time_last_updated = excluded.time_last_updated, state=${UserState.ActiveAndLinkedWithAuth0}
		    returning id, time_created`,
	            [UserState.ActiveAndLinkedWithAuth0, Role.Regular, userIdHash, requestTime, requestTime]);

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
            UserState.ActiveAndLinkedWithAuth0,
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
	      .where({auth0_user_id_hash: userIdHash, state: UserState.ActiveAndLinkedWithAuth0})
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
	      .where({auth0_user_id_hash: userIdHash, state: UserState.ActiveAndLinkedWithAuth0})
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
