const express = require('express');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const config = require('config');
const bodyParser = require('body-parser');

const JWKSURI = config.get('jwksUri');
const DOMAIN = config.get('domain');

const USERS = "Users";
const BOATS = "Boats";

const router = express.Router();
router.use(bodyParser.json());

const ds = require('../Datastore/datastore');
const datastore = ds.datastore;


const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: JWKSURI
    }),
    //Validate the audience and issuer
    issuer: DOMAIN,
    algorithms: ['RS256']
});

/* ------------- Begin Users Model ------------- */

/**
 * 
 * @param {object} req object 
 * @returns the users in the datastore
 */
const getUsers = req => {
    const query = datastore.createQuery(USERS);
    return datastore.runQuery(query)
        .then(entities => {
            const users = entities[0].map(ds.fromDatastore);
            for(let i = 0; i < users.length; i++) {
                users[i].self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${users[i].id}`;
            }
            return users;
        });
};

const getUser = (req, id) => {
    const key = datastore.key([USERS, parseInt(id, 10)]);
    const query = datastore.createQuery(USERS).filter('__key__', '=', key);
    return datastore.runQuery(query)
        .then(user => {
            var keyUser = user[0].map(ds.fromDatastore);
            if(keyUser[0] != null) {
                keyUser[0].self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${key.id}`;
                return keyUser[0];
            }
        });
};

const deleteUser = id => {
    const key = datastore.key([USERS, parseInt(id, 10)]);
    return datastore.delete(key);
}

/* ------------- End Users Model ------------- */

/* ------------- Begin Users Routes ------------- */

router.get('/', (req, res) => {
    getUsers(req)
        .then(users => {
            res.status(200).json(users);
        });
});

router.get('/:user_id', (req, res) => {
    getUser(req, req.params.user_id)
        .then(user => {
            if(!user) {
                res.status(404).json({ Error: "No user with user_id exists" });
            } else {
                res.status(200).json(user);
            }
        });
});

router.delete('/:user_id', (req, res) => {
    getUser(req, req.params.user_id)
        .then(user => {
            if(user) {
                deleteUser(req.params.user_id)
                    .then(res.status(204).end());
            } else {
                res.status(404).json({ Error: "User with user_id not found" });
            }
        });
});

/* ------------- End Users Routes ------------- */

module.exports = router;
