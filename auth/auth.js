const express = require('express');
const requestPromise = require('request-promise');
const bodyParser = require('body-parser');
const config = require('config');

const ds = require('../Datastore/datastore');
const datastore = ds.datastore;

const router = express.Router();
router.use(bodyParser.json());


const USERS = "Users";

const CLIENT_ID = config.get('client_id');
const CLIENT_SECRET = config.get('client_secret');
var token = '';
var state = '';
var idToken = '';

const createState = length => {
    var str = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const characterLength = characters.length;
    for(let i = 0; i < length; i++) {
        str += characters.charAt(Math.floor(Math.random() * characterLength));
    }
    return str;
};

/* ------------- Begin Oauth Model ------------- */

/**
 * 
 * @param {string} firstName of the user
 * @param {string} lastName of the user
 * @param {string} uniqueId the unique id of the user
 * @returns 
 */
const createUser = (firstName, lastName, uniqueId) => {
    const key = datastore.key(USERS);
    const newUser = {
        firstName: firstName,
        lastName: lastName,
        uniqueId: uniqueId
    };
    return datastore.save({
        key: key,
        data: newUser
    })
    .then(() => { return key });
};

/* ------------- End Oauth Model ------------- */

/* ------------- Begin Oauth Routes ------------- */

router.get('/', (req, res) => {
    res.render('home');
});

router.get('/authorize', (req, res) => {
    state = createState(14);
    const url = 'https://final-project-leonep-1041pm.wl.r.appspot.com/oauth';
    // const url = 'http://localhost:8000/oauth'
    const redirect = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${url}&scope=profile&state=${state}`;
    res.redirect(redirect);
});

//retrieve authorization code
router.get('/oauth', (req, res) => {
    if(req.query.state == state) {
        //Request promise to get the access token
        var options = {
            method: 'POST',
            uri: 'https://www.googleapis.com/oauth2/v4/token',
            formData: {
                code: req.query.code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: 'https://final-project-leonep-1041pm.wl.r.appspot.com/oauth',
                // redirect_uri: 'http://localhost:8000/oauth',
                grant_type: 'authorization_code'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };
        requestPromise(options)
            .then(body => {
                token = JSON.parse(body).access_token
                idToken = JSON.parse(body).id_token 
                console.log(idToken);
                res.redirect('/granted');
            })
            .catch(err => {
                res.status(500).send(err);
            });
    } else {
        console.log('States do not match');
        res.status(500).send('Internal Server Error');
    }
    console.log("State: ", state);
    console.log("Query: ", req.query.state);
});

router.get('/granted', (req, res) => {
    const header = `Bearer ${token}`;
    var options = {
        uri: 'https://people.googleapis.com/v1/people/me?personFields=names',
        headers: {
            'Authorization': header
        },
        json: true
    };
    requestPromise(options)
        .then(person => {
            var context = {};
            context.firstName = person.names[0].givenName,
            context.lastName = person.names[0].familyName,
            context.uniqueId = person.names[0].metadata.source.id;
            console.log(person.names[0].metadata.source.id);
            context.idToken = idToken;

            var firstName = person.names[0].givenName;
            var lastName = person.names[0].familyName;
            var uniqueId = person.names[0].metadata.source.id;

            const query = datastore.createQuery(USERS).filter('uniqueId', uniqueId);
            return datastore.runQuery(query)
                .then(uniq => {
                    const uid = uniq[0].map(ds.fromDatastore);
                    if(!uid[0]) {
                        createUser(firstName, lastName, uniqueId);
                    } else {
                        uid[0].uniqueId == uniqueId ? context.loggedIn = `User with Unique Id of ${uniqueId} already exists. User is logged in` 
                        : 
                        undefined;
                    }
                    res.render('userData', context);
                });
        })
        .catch(err => {
            console.log(err);
            res.status(500).send('Internal Server Error');
        });
});

/* ------------- End Oauth Routes ------------- */


module.exports = router;