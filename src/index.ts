import * as auth0 from 'auth0'
import * as crypto from 'crypto'
import * as express from 'express'
import { execSync } from 'child_process'

import * as m from '@neoncity/common-js/marshall'
import { MarshalFrom, MarshalWith } from '@neoncity/common-js/marshall'
import { AuthInfo, Role, User } from '@neoncity/identity-sdk-js'

import * as config from './config';


class Auth0Profile {
    @MarshalWith(m.StringMarshaller)
    name: string;

    @MarshalWith(m.UriMarshaller)
    picture: string;

    @MarshalWith(m.StringMarshaller)
    user_id: string;
}

async function main() {
    execSync('./node_modules/.bin/knex migrate:latest');

    const app = express();
    const auth0Client = new auth0.AuthenticationClient({
	clientId: config.AUTH0_CLIENT_ID,
	domain: config.AUTH0_DOMAIN
    });
    
    const authInfoMarshaller = new (MarshalFrom(AuthInfo))();
    const auth0ProfileMarshaller = new (MarshalFrom(Auth0Profile))();
    const userMarshaller = new (MarshalFrom(User))();

    app.use((_: express.Request, res: express.Response, next: () => void) => {
	res.header('Access-Control-Allow-Origin', config.CLIENTS);
	res.header('Access-Control-Allow-Headers', 'X-NeonCity-AuthInfo'); // TODO: make this better
	next();
    });

    app.get('/user', async (req: express.Request, res: express.Response) => {
	const authInfoSerialized: string|undefined = req.header('X-NeonCity-AuthInfo');
	if (typeof authInfoSerialized == 'undefined') {
	    res.status(401);
	    res.end();
	    return;
	}
	
	let authInfo: AuthInfo|null = null;
	try {
	    authInfo = authInfoMarshaller.extract(JSON.parse(authInfoSerialized));
	} catch (e) {
	    res.status(400);
	    res.end();
	    return;
	}

	// Make a call to auth0
	let userProfile: Auth0Profile|null = null;
	try {
	    const userProfileSerialized = await auth0Client.getProfile(authInfo.auth0AccessToken);
	    userProfile = auth0ProfileMarshaller.extract(JSON.parse(userProfileSerialized));
	} catch (e) {
	    res.status(500);
	    res.end();
	    return;
	}

	// Compute hash of user_id.
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(userProfile.user_id);
	const auth0UserIdHash = sha256hash.digest('hex');

	// Lookup id hash in database

	// Return joined value from auth0 and db

	const user = new User(
	    1,
	    new Date(123151131),
	    new Date(123151131),
	    Role.Regular,
	    auth0UserIdHash,
	    userProfile.name,
	    userProfile.picture);
	
        res.write(JSON.stringify(userMarshaller.pack(user)));
        res.end();
    });

    app.post('/user', async (_: express.Request, res: express.Response) => {
        res.write(JSON.stringify({user: {id: 1, timeCreated: 123151131, timeLastUpdated: 123151131, role: 1, auth0UserIdHash: '0000000000000000000000000000000000000000000000000000000000000000', pictureUri: 'http://example.com/a.jpeg'}}));
        res.end();
    });

    app.listen(config.PORT, config.ADDRESS, () => {
	console.log(`Started ... ${config.ADDRESS}:${config.PORT}`);
    });
}

main();
