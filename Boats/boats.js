const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const config = require('config');

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

/* ------------- Begin Boats Model ------------- */

const createBoat = (name, type, length, owner) => {
    const key = datastore.key(BOATS);
    const boat = {
        name: name,
        type: type,
        length: length,
        owner: owner,
        containers: []
    };
    return datastore.save({
        key: key,
        data: boat
    })
    .then(() => { return key });
};

/**
 * Function to return all boats
 * @param {object} owner of the boats
 * @returns all boats with jwt authentication that belong to the owner
 */
const getAllOwnerBoats = (req, owner) => {
    var query = datastore.createQuery(BOATS).limit(5);
    const results = {};

    //check if the query includes 'cursor'
    if(Object.keys(req.query).includes("cursor")) {
        query = query.start(req.query.cursor);
    }
    return datastore.runQuery(query)
        .then(entities => {
            //set the results to the results from the datastore
            results.item = entities[0].map(ds.fromDatastore).filter(item => item.owner === owner);
            const boats = entities[0].map(ds.fromDatastore);
            if(entities[1].moreResults !== ds.datastore.NO_MORE_RESULTS) {
                results.next = `${req.protocol}://${req.get("host")}${req.baseUrl}?cursor=${entities[1].endCursor}`;
            }
            for(let i = 0; i < boats.length; i++) {
                results.item[i].self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${boats[i].id}`;
            }
            return results;
        });
};

/**
 * 
 * @param {string} id of the boat 
 * @returns the key of the boat from the datastore
 */
const getBoat = id => {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    return datastore.get(key);
};

/**
 * Function to delete a boat that belongs to the specified owner
 * @param {string} id of the boat
 * @param {object} owner of the boat
 */
const deleteBoat = (id, owner) => {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    return datastore.delete(key);
};

/* ------------- End Boats Model ------------- */

/* ------------- Begin Boats Routes ------------- */

//Create a user boat
router.post('/', checkJwt, (req, res) => {
    if(req.get('Content-Type') !== 'application/json') {
        res.status(415).json({ Error: 'Server only accepts application/json data.' });
    } else if(!checkJwt) {
        res.status(401).end();
    } else if(!req.body.name || !req.body.type || !req.body.length) {
        res.status(400).json({ Error: "The request object is missing at least one of the required attributes." });
    } else {
        createBoat(req.body.name, req.body.type, req.body.length, req.user.sub)
            .then(key => {
                boat = {
                    id: key.id,
                    name: req.body.name,
                    type: req.body.type,
                    length: req.body.length,
                    owner: req.user.sub,
                    self: `${req.protocol}://${req.get("host")}${req.baseUrl}/${key.id}`
                };
                res.status(201).json(boat);
            });
    }
});

//Get all boats of the owner both private and public
router.get('/', checkJwt, (req, res) => {
    getAllOwnerBoats(req, req.user.sub)
        .then(boats => {
            return res.status(200).json(boats);
        });
});

//Delete a user boat
router.delete('/:boat_id', checkJwt, (req, res) => {
    if(!checkJwt) {
        res.status(401).json({ Error: "Missing/Invalid Jwt"});
    } else {
        getBoat(req.params.boat_id)
            .then(boat => {
                if(!boat[0]) {
                    res.status(404).json({ Error: "No boat with this boat_id exists" });
                } else if(boat[0].owner && boat[0].owner !== req.user.sub) {
                    res.status(403).json({ Error: "Boat is owner by someone else" });
                } else {
                    deleteBoat(req.params.boat_id)
                        .then(res.status(204).end());
                }
            });
    }
});

/* ------------- End Boats Routes ------------- */

module.exports = router;