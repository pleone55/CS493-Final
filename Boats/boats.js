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
            console.log(entities);
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

const patchBoat = (id, name, type, length, owner) => {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    const newBoat = {
        name: name,
        type: type,
        length: length,
        owner: owner
    };
    return datastore.update({
        key: key,
        data: newBoat
    }).then(() => { return key });
}

/**
 * Function that returns a boat by the id
 * @param {string} id of the boat
 * @returns the boat specified by the id 
 */
const getBoat = (req, id) => {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    const query = datastore.createQuery(BOATS).filter('__key__', '=', key);
    return datastore.runQuery(query)
        .then(results => {
            var keyBoat = results[0].map(ds.fromDatastore);
            if(keyBoat[0] != null) {
                keyBoat[0].self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${key.id}`
                return keyBoat[0];
            }
        });
};

const getBoatForPatch = id => {
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

//Patch user boat properties
router.patch('/:boat_id', checkJwt, (req, res) => {
    if(req.get('Content-Type') !== 'application/json') {
        res.status(415).json({ Error: 'Server only accepts application/json data.' });
    } else if(!checkJwt) {
        res.status(401).end();
    }
    if(Object.keys(req.body).indexOf("owner") > -1) {
        res.status(400).json({ Error: "Cannot update the owner of the boat." });
    }
    if(req.body.name && req.body.type && req.body.length) {
        getBoatForPatch(req.params.boat_id)
        .then(boat => {
            boat[0].name = req.body.name;
            boat[0].type = req.body.type;
            boat[0].length = req.body.length;
            try {
                patchBoat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, req.user.sub)
                    .then(() => {
                        console.log(boat);
                        res.status(200).end()
                    });
            } catch (err) {
                res.status(400).json({ Error: "Could not patch boat attribute" });
            }
        })
        .catch(() => res.status(404).json({ Error: "No boat with boat_id exists" }));
    } else if(req.body.name && req.body.type) {
        getBoatForPatch(req.params.boat_id)
        .then(boat => {
            boat[0].name = req.body.name;
            boat[0].type = req.body.type;
            try {
                patchBoat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, req.user.sub)
                    .then(() => {
                        console.log(boat);
                        res.status(200).end()
                    });
            } catch (err) {
                res.status(400).json({ Error: "Could not patch boat attribute" });
            }
        })
        .catch(() => res.status(404).json({ Error: "No boat with boat_id exists" }));
    } else if(req.body.name && req.body.length) {
        getBoatForPatch(req.params.boat_id)
        .then(boat => {
            boat[0].name = req.body.name;
            boat[0].length = req.body.length;
            try {
                patchBoat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, req.user.sub)
                    .then(() => {
                        console.log(boat);
                        res.status(200).end()
                    });
            } catch (err) {
                res.status(400).json({ Error: "Could not patch boat attribute" });
            }
        })
        .catch(() => res.status(404).json({ Error: "No boat with boat_id exists" }));
    } else if(req.body.type && req.body.length) {
        getBoatForPatch(req.params.boat_id)
        .then(boat => {
            boat[0].type = req.body.type;
            boat[0].length = req.body.length;
            try {
                patchBoat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, req.user.sub)
                    .then(() => {
                        console.log(boat);
                        res.status(200).end()
                    });
            } catch (err) {
                res.status(400).json({ Error: "Could not patch boat attribute" });
            }
        })
        .catch(() => res.status(404).json({ Error: "No boat with boat_id exists" }));
    } else if(req.body.name) {
        getBoatForPatch(req.params.boat_id)
            .then(boat => {
                boat[0].name = req.body.name;
                try {
                    patchBoat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, req.user.sub)
                        .then(() => {
                            console.log(boat);
                            res.status(200).end()
                        });
                } catch (err) {
                    res.status(400).json({ Error: "Could not patch boat attribute" });
                }
            })
            .catch(() => res.status(404).json({ Error: "No boat with boat_id exists" }));
    } else if(req.body.type) {
        getBoatForPatch(req.params.boat_id)
        .then(boat => {
            boat[0].type = req.body.type;
            try {
                patchBoat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, req.user.sub)
                    .then(res.status(200).end());
            } catch (err) {
                res.status(400).json({ Error: "Could not patch boat attribute" });
            }
        })
        .catch(() => res.status(404).json({ Error: "No boat with boat_id exists" }));
    } else if(req.body.length) {
        getBoatForPatch(req.params.boat_id)
        .then(boat => {
            boat[0].length = req.body.length;
            try {
                patchBoat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, req.user.sub)
                    .then(res.status(200).end());
            } catch (err) {
                res.status(400).json({ Error: "Could not patch boat attribute" });
            }
        })
        .catch(() => res.status(404).json({ Error: "No boat with boat_id exists" }));
    } else {
        res.status(400).json({ Error: "Something went wrong" });
    }
});

//Get all boats of the owner
router.get('/', checkJwt, (req, res) => {
    getAllOwnerBoats(req, req.user.sub)
        .then(boats => {
            res.status(200).json(boats);
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
                    res.status(403).json({ Error: "Boat is owned by someone else" });
                } else {
                    deleteBoat(req.params.boat_id)
                        .then(res.status(204).end());
                }
            });
    }
});

//Get boat by id
//Supports viewing boat in JSON only
router.get('/:boat_id', (req, res) => {
    getBoat(req, req.params.boat_id)
        .then(boat => {
            if(boat) {
                const accepts = req.accepts(['application/json']);
                if(!accepts) {
                    res.status(406).send('Not Acceptable');
                } else if(accepts === 'application/json') {
                    res.status(200).json(boat);
                } else {
                    res.status(500).send('Content Type not correct.');
                }
            } else {
                res.status(404).json({ Error: "No boat with this boat_id exists." });
            }
        });
});

/* ------------- End Boats Routes ------------- */

module.exports = router;