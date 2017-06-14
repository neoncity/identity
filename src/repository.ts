import * as knex from 'knex'
import * as moment from 'moment'
import * as uuid from 'uuid'

import { randomBytes } from 'crypto'

import {
    AuthInfo,
    Role,
    Session,
    SessionState,
    SessionEventType,
    User,
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
    private static readonly _SessionMaxLengthInDays = 30;
    
    private static readonly _sessionFields = [
	'identity.session.id as session_id',
	'identity.session.state as session_state',
        'identity.session.xsrf_token as session_xsrf_token',
	'identity.session.time_expires as session_time_expires',
	'identity.session.user_id as session_user_id',
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
    
    private readonly _conn: knex;

    constructor(conn: knex) {
	this._conn = conn;
    }

    async getOrCreateSession(authInfo: AuthInfo|null, requestTime: Date): Promise<[AuthInfo, Session, boolean]> {
	let dbSession: any|null = null;
	let needToCreateSession = authInfo == null;

	await this._conn.transaction(async (trx) => {
	    // If there's some auth info, might as well try to retrieve it.
	    if (authInfo != null) {
		const dbSessions = await trx
		      .from('identity.session')
		      .select(Repository._sessionFields)
		      .whereIn('state', [SessionState.Active, SessionState.ActiveAndLinkedWithUser])
		      .andWhere('id', authInfo.sessionId)
		      .limit(1);

		// If we can't retrieve it or if it's expired, we need to create a new session.
		if (dbSessions.length == 0) {
		    needToCreateSession = true;
		} else {
		    dbSession = dbSessions[0];

		    if (requestTime > dbSession['session_time_expires']) {
			needToCreateSession = true;
		    }
		}
	    }

	    // If we've determined we need to create a session, we should do so.
	    if (needToCreateSession) {
		const sessionId = uuid();
                const xsrfToken = randomBytes(48).toString('base64');
		const timeExpires = moment(requestTime).add(Repository._SessionMaxLengthInDays, 'days').toDate();
		
		const dbSessions = await trx
		      .from('identity.session')
		      .returning(Repository._sessionFields)
		      .insert({
			  'id': sessionId,
			  'state': SessionState.Active,
                          'xsrf_token': xsrfToken,
			  'time_expires': timeExpires,
			  'user_id': null,
			  'time_created': requestTime,
			  'time_last_updated': requestTime,
			  'time_removed': null
		      });

		dbSession = dbSessions[0];

		await trx
		    .from('identity.session_event')
		    .insert({
			'type': SessionEventType.Created,
			'timestamp': requestTime,
			'data': null,
			'session_id': sessionId
		    });
	    }
	});

	const newAuthInfo = new AuthInfo(dbSession['session_id']);

	const session = new Session();
	session.state = SessionState.Active;
        session.xsrfToken = dbSession['session_xsrf_token'];
	session.timeExpires = dbSession['session_time_expires'];
	session.user = null;
	session.timeCreated = dbSession['session_time_created'];
	session.timeLastUpdated = dbSession['session_time_last_updated'];

	return [newAuthInfo, session, needToCreateSession];
    }

    async getSession(authInfo: AuthInfo, requestTime: Date): Promise<Session> {
	const dbSessions = await this._conn('identity.session')
	      .select(Repository._sessionFields)
	      .whereIn('state', [SessionState.Active, SessionState.ActiveAndLinkedWithUser])
	      .andWhere('id', authInfo.sessionId)
	      .limit(1);

	if (dbSessions.length == 0) {
	    throw new SessionNotFoundError('Session does not exist');
	}

	const dbSession = dbSessions[0];

	if (requestTime > dbSession['session_time_expires']) {
	    throw new SessionNotFoundError('Session has expired');
	}

	const session = new Session();
	session.state = dbSession['session_state'];
        session.xsrfToken = dbSession['session_xsrf_token'];
	session.timeExpires = dbSession['session_time_expires'];
	session.user = null;
	session.timeCreated = dbSession['session_time_created'];
	session.timeLastUpdated = dbSession['session_time_last_updated'];

	return session;
    }

    async expireSession(authInfo: AuthInfo, requestTime: Date): Promise<void> {
	await this._conn.transaction(async (trx) => {
	    const dbIds = await trx
		  .from('identity.session')
		  .whereIn('state', [SessionState.Active, SessionState.ActiveAndLinkedWithUser])
		  .andWhere('id', authInfo.sessionId)
		  .returning(['id'])
		  .update({
		      'state': SessionState.Expired,
		      'time_last_updated': requestTime,
		      'time_removed': requestTime
		  });

	    if (dbIds.length == 0) {
		throw new SessionNotFoundError('Session does not exist');
	    }

	    await trx
		.from('identity.session_event')
		.insert({
		    'type': SessionEventType.Expired,
		    'timestamp': requestTime,
		    'data': null,
		    'session_id': authInfo.sessionId
		});
	});
    }

    async getOrCreateUserOnSession(authInfo: AuthInfo, auth0Profile: Auth0Profile, requestTime: Date): Promise<[AuthInfo, Session, boolean]> {
	const userIdHash = auth0Profile.getUserIdHash();

	let dbSession: any|null = null;
	let dbUserId: number = -1;
	let dbUserTimeCreated: Date = new Date();
	let userEventType: UserEventType = UserEventType.Unknown;
	
        await this._conn.transaction(async (trx) => {
	    const dbSessions = await trx
		  .from('identity.session')
		  .select(Repository._sessionFields)
		  .whereIn('state', [SessionState.Active, SessionState.ActiveAndLinkedWithUser])
		  .andWhere('id', authInfo.sessionId)
		  .limit(1);

	    if (dbSessions.length == 0) {
		throw new SessionNotFoundError('Session does not exist');
	    }

	    dbSession = dbSessions[0];

	    if (requestTime > dbSession['session_time_expires']) {
		throw new SessionNotFoundError('Session has expired');
	    }
	    
	    const rawResponse = await trx.raw(`
                    insert into identity.user (state, role, auth0_user_id_hash, time_created, time_last_updated)
                    values (?, ?, ?, ?, ?)
	            on conflict (auth0_user_id_hash) do update set time_last_updated = excluded.time_last_updated, state=${UserState.Active}
		    returning id, time_created`,
	            [UserState.Active, Role.Regular, userIdHash, requestTime, requestTime]);

	    dbUserId = rawResponse.rows[0]['id'];
	    dbUserTimeCreated = rawResponse.rows[0]['time_created'];

	    if (dbSession['session_user_id'] != null && dbSession['session_user_id'] != dbUserId) {
		throw new SessionNotFoundError('Session associated with another user already');
	    }

            userEventType = rawResponse.rows[0]['time_created'] == rawResponse.rows[0]['time_last_updated']
                  ? UserEventType.Created
                  : UserEventType.Recreated;

            await trx
                  .from('identity.user_event')
                  .insert({
                      'type': userEventType,
                      'timestamp': requestTime,
                      'data': null,
                      'user_id': dbUserId
                  });

	    if (dbSession['session_user_id'] == null) {
		await trx
		    .from('identity.session')
		    .where({id: authInfo.sessionId})
		    .update({
			state: SessionState.ActiveAndLinkedWithUser,
			user_id: dbUserId,
			time_last_updated: requestTime
		    });

		await trx
		    .from('identity.session_event')
		    .insert({
			'type': SessionEventType.LinkedWithUser,
			'timestamp': requestTime,
			'data': null,
			'session_id': dbSession['session_id']
		    });
	    }	    
	});

	const session = new Session();
	session.state = SessionState.Active;
        session.xsrfToken = dbSession['session_xsrf_token'];
	session.timeExpires = dbSession['session_time_expires'];
	session.user = new User(
	    dbUserId,
            UserState.Active,
	    Role.Regular,
	    userIdHash,
	    dbUserTimeCreated,
	    requestTime,
	    auth0Profile.name,
	    auth0Profile.picture,
	    auth0Profile.language);
	session.timeCreated = dbSession['session_time_created'];
	session.timeLastUpdated = dbSession['session_time_last_updated'];

	return [authInfo, session, userEventType as UserEventType == UserEventType.Created as UserEventType];
    }

    async getUserOnSession(authInfo: AuthInfo, auth0Profile: Auth0Profile, requestTime: Date): Promise<Session> {
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

	const dbSessions = await this._conn('identity.session')
	      .select(Repository._sessionFields)
	      .where('state', SessionState.ActiveAndLinkedWithUser)
	      .andWhere('id', authInfo.sessionId)
	      .limit(1);

	if (dbSessions.length == 0) {
	    throw new SessionNotFoundError('Session does not exist');
	}

	const dbSession = dbSessions[0];

	if (requestTime > dbSession['session_time_expires']) {
	    throw new SessionNotFoundError('Session has expired');
	}

	if (dbSession['session_user_id'] != dbUser['user_id']) {
	    throw new SessionNotFoundError('Session and user do not match');
	}

	const session = new Session();
	session.state = dbSession['session_state'];
        session.xsrfToken = dbSession['session_xsrf_token'];
	session.timeExpires = dbSession['session_time_expires'];
	session.user = new User(
	    dbUser['user_id'],
            dbUser['user_state'],
	    dbUser['user_role'],
	    userIdHash,
	    new Date(dbUser['user_time_created']),
	    new Date(dbUser['user_time_last_updated']),
	    auth0Profile.name,
	    auth0Profile.picture,
	    auth0Profile.language);
	session.timeCreated = dbSession['session_time_created'];
	session.timeLastUpdated = dbSession['session_time_last_updated'];

	return session;
    }
}
