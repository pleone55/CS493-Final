const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const config = require('config');

const JWKSURI = config.get('jwksUri');
const DOMAIN = config.get('domain');

const CONTAINERS = "Containers";
const BOATS = "Boats";

const router = express.Router();
router.use(bodyParser.json());

const ds = require('../Datastore/datastore');
const datastore = ds.datastore;


//Function to check if the JWT value is valid
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

/**
 * 
 * @param {string} name of the boat 
 * @param {string} type of the boat
 * @param {string} length of the boat
 * @param {string} owner of the boat
 * @returns the created boat and its attributes
 */
const createBoat = (name, type, length, owner) => {
    const key = datastore.key(BOATS);
    const boat = {
        name: name,
        type: type,
        length: length,
        containers: [],
        owner: owner
    };
    return datastore.save({
        key: key,
        data: boat
    })
    .then(() => { return key });
};

/**
 * Function to return all boats
 * @param {object} req the request of current base url
 * @param {string} owner of the boats
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
            var count = entities[0].map(ds.fromDatastore).filter(item => item.owner === owner).length;
            //set the results to the results from the datastore
            results.items = entities[0].map(ds.fromDatastore).filter(item => item.owner === owner);
            // const boats = entities[0].map(ds.fromDatastore);
            if(entities[1].moreResults !== ds.datastore.NO_MORE_RESULTS) {
                results.next = `${req.protocol}://${req.get("host")}${req.baseUrl}?cursor=${entities[1].endCursor}`;
            }
            results.items.push({
                boats: count
            });
            return results;
        });
};

/**
 * 
 * @param {string} id of the boat to patch
 * @param {string} name of the patched boat
 * @param {string} type of the patched boat
 * @param {Number} length of the patched boat
 * @param {string} owner of the boat
 * @returns the updated boat with the updated attributes
 */
const patchBoat = async (id, name, type, length, owner) => {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    const boat = await getBoatForUpdateAndDelete(id);
    const { containers } = boat[0];
    const newBoat = {
        name: name,
        type: type,
        length: length,
        containers: containers,
        owner: owner
    };
    return datastore.update({
        key: key,
        data: newBoat
    }).then(() => { return key });
};

/**
 * 
 * @param {string} id of the boat to patch
 * @param {string} name of the patched boat
 * @param {string} type of the patched boat
 * @param {Number} length of the patched boat
 * @param {string} owner of the boat
 * @returns the updated boat with the updated attributes
 */
const putBoat = async (id, name, type, length, owner) => {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    const boat = await getBoatForUpdateAndDelete(id);
    const { containers } = boat[0];
    const newBoat = {
        name: name,
        type: type,
        length: length,
        containers: containers,
        owner: owner
    };
    return datastore.update({
        key: key,
        data: newBoat
    }).then(() => { return key });
};

/**
 * 
 * @param {object} req the request sent
 * @param {object} res the response received
 * @param {string} boat_id of the boat
 * @param {string} container_id of the container
 * @returns updated Boat with Container added
 */
const addContainerToBoat = async (req, res, boat_id, container_id) => {
    const key = datastore.key([BOATS, parseInt(boat_id, 10)]);
    const container = await getContainerForUpdateAndDelete(container_id);
    const boat = await getBoatForUpdateAndDelete(boat_id);
    const { name, type, length, containers, owner } = boat[0];
    const { number, weight, content } = container[0];

    //Check if container id is already on the boat
    let isOnBoat = false;
    for(let i = 0; i < containers.length; i++) {
        if(containers[i].id === container_id) {
            isOnBoat = true;
            res.status(403).json({ Error: "Container is already assigned a boat. Remove before assigning." });
            break;
        }
    }

    if(!isOnBoat) {
        let containerObj = {
            id: container_id,
            number: number,
            weight: weight,
            content: content,
            self: `${req.protocol}://${req.get("host")}${'/containers'}/${container_id}`
        };
        containers.push(containerObj);
    }
    const updatedBoat = {
        name: name,
        type: type,
        length: length,
        containers: containers,
        owner: owner
    };

    return datastore.update({
        key: key,
        data: updatedBoat
    })
    .then(() => { return key });
};

/**
 * 
 * @param {object} req the request sent
 * @param {object} res the response received
 * @param {string} boat_id of the boat
 * @param {string} container_id of the container
 * @returns the updated container with boat it is assigned to
 */
const addBoatToContainer = async (req, res, boat_id, container_id) => {
    const key = datastore.key([CONTAINERS, parseInt(container_id, 10)]);
    const container = await getContainerForUpdateAndDelete(container_id);
    const getBoat = await getBoatForUpdateAndDelete(boat_id);
    if(!getBoat[0] || !container[0]) {
        res.status(404).json({ Error: "No boat with boat_id and/or container with container_id exists" });
    } else {
        const { name } = getBoat[0];
        const { number, weight, content, boat } = container[0];

        let isAssigned = false;
        if(boat.id && boat.name) {
            isAssigned = true;
            res.status(403).json({ Error: "Container is already assigned a boat. Remove before assigning." });
            return;
        }

        if(!isAssigned) {
            //Insert boat info into container
            boat.id = boat_id;
            boat.name = name;
            boat.self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${boat_id}`
        }

        const updatedContainer = {
            number: number,
            weight: weight,
            content: content,
            boat: boat
        };

        return datastore.update({
            key: key,
            data: updatedContainer
        })
        .then(() => { return key });
    }
};

/**
 * 
 * @param {object} res the response received
 * @param {string} boat_id of the boat
 * @param {string} container_id of the container
 * @returns the updated boat with the container removed
 */
const removeContainerFromBoat = async (res, boat_id, container_id) => {
    const key = datastore.key([BOATS, parseInt(boat_id, 10)]);
    const boat = await getBoatForUpdateAndDelete(boat_id);
    if(!boat[0]) {
        res.status(404).json({ Error: "No boat with boat_id and/or container with container_id exists" });
    } else {
        const { name, type, length, containers, owner } = boat[0];
        const updatedContainer = containers.filter(c => c.id !== container_id);

        const updatedBoatContainers = {
            name: name,
            type: type,
            length: length,
            containers: updatedContainer,
            owner: owner
        };

        return datastore.update({
            key: key,
            data: updatedBoatContainers
        })
        .then(() => { return key });
    }
};

/**
 * 
 * @param {object} res the response received
 * @param {string} container_id of the container
 * @returns the container with the boat removed
 */
const removeBoatFromContainer = async(res, container_id) => {
    const key = datastore.key([CONTAINERS, parseInt(container_id, 10)]);
    const container = await getContainerForUpdateAndDelete(container_id);
    if(!container[0]) {
        res.status(404).json({ Error: "No boat with boat_id and/or container with container_id exists" });
    } else { 
        const { number, weight, content, boat } = container[0];
        boat.id = null;
        boat.name = null;
        boat.self = null;

        const updatedContainer = {
            number: number,
            weight: weight,
            content: content,
            boat: boat
        };

        return datastore.update({
            key: key,
            data: updatedContainer
        })
        .then(() => { return key });
    }
};

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

/**
 * 
 * @param {string} id of the boat
 * @returns boat matching the id
 */
const getBoatForUpdateAndDelete = id => {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    return datastore.get(key);
};

/**
 * 
 * @param {string} id of the container
 * @returns container matching the id
 */
const getContainerForUpdateAndDelete = id => {
    const key = datastore.key([CONTAINERS, parseInt(id, 10)]);
    return datastore.get(key);
};

/**
 * Function to delete a boat that belongs to the specified owner
 * @param {string} id of the boat
 * @param {object} owner of the boat
 */
const deleteBoat = id => {
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
                    containers: [],
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
    getBoatForUpdateAndDelete(req.params.boat_id)
        .then(boat => {
            if(boat[0].owner && boat[0].owner !== req.user.sub) {
                res.status(403).json({ Error: "Boat is owned by someone else" });
            } else {
                let { name, type, length } = req.body;

                //Check which properties are in the request body
                //Set the properties to the appropriate fields in the body else remain the same
                if(!name) {
                    name = boat[0].name;
                }
                if(!type) {
                    type = boat[0].type;
                }
                if(!length) {
                    length = boat[0].length;
                }
                patchBoat(req.params.boat_id, name, type, length, req.user.sub)
                    .then(() => {
                        res.status(204).end();
                    })
                    .catch(() => {
                        res.status(400).json({ Error: "Could not patch boat attribute" });
                    });
            }
        })
        .catch(() => {
            res.status(404).json({ Error: "No boat with boat_id exists" });
        });
});

//Put user boat properties
router.put('/:boat_id', checkJwt, (req, res) => {
    if(req.get('Content-Type') !== 'application/json') {
        res.status(415).json({ Error: 'Server only accepts application/json data.' });
    } else if(!checkJwt) {
        res.status(401).end();
    }
    if(Object.keys(req.body).indexOf("owner") > -1) {
        res.status(400).json({ Error: "Cannot update the owner of the boat." });
    }
    let { name, type, length } = req.body;
    if(name && type && length) {
        getBoatForUpdateAndDelete(req.params.boat_id)
            .then(boat => {
                if(!boat[0]) {
                    res.status(404).json({ Error: "No boat with boat_id exists" });
                } else if(boat[0].owner && boat[0].owner !== req.user.sub) {
                    res.status(403).json({ Error: "Boat is owned by someone else" });
                } else {
                    putBoat(req.params.boat_id, name, type, length, req.user.sub)
                        .then(() => {
                            res.status(204).end();
                        })
                        .catch(() => {
                            res.status(400).json({ Error: "Could not update boat entitiy." });
                        });
                }
            });
    } else {
        res.status(400).json({ Error: "The request object is missing at least one of the required attributes." });
    }
});

//Add Containers to Boat and add Boat to Container
router.put('/:boat_id/containers/:container_id', checkJwt, (req, res) => {
    if(!checkJwt) {
        res.status(401).end();
    }
    addContainerToBoat(req, res, req.params.boat_id, req.params.container_id);
    addBoatToContainer(req, res, req.params.boat_id, req.params.container_id)
        .then(() => {
            res.status(204).end();
        })
        .catch(() => {
            res.status(400).json({ Error: "Could not add container and/or boat" });
        });
});

//Delete Containers from Boat and delete Boat from Container
router.delete('/:boat_id/containers/:container_id', checkJwt, (req, res) => {
    if(!checkJwt) {
        res.status(401).end();
    }
    removeContainerFromBoat(res, req.params.boat_id, req.params.container_id)
    removeBoatFromContainer(res, req.params.container_id)
        .then(() => {
            res.status(204).end();
        })
        .catch(() => {
            res.status(400).json({ Error: "Could not remove container and/or boat" });
        });
});;

//Get all boats of the owner
router.get('/', checkJwt, (req, res) => {
    getAllOwnerBoats(req, req.user.sub)
        .then(boats => {
            for(let i = 0; i < boats.items.length - 1; i++) {
                boats.items[i].self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${boats.items[i].id}`;
            }
            res.status(200).json(boats);
        });
});

//Delete a user boat
router.delete('/:boat_id', checkJwt, (req, res) => {
    if(!checkJwt) {
        res.status(401).json({ Error: "Missing/Invalid Jwt"});
    } else {
        getBoatForUpdateAndDelete(req.params.boat_id)
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

//Get owner boat by id
//Supports viewing boat in JSON only
router.get('/:boat_id', checkJwt, (req, res) => {
    getBoat(req, req.params.boat_id)
        .then(boat => {
            if(boat) {
                const accepts = req.accepts(['application/json']);
                if(!accepts) {
                    res.status(406).json({ Error: 'Not Acceptable' });
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

//Delete all Boats
router.delete('/', (req, res) => {
    res.set('Accept', 'GET, POST');
    res.status(405).json({ Error: "Cannot delete all boats" });
});

//Update All Boats
router.put('/', (req, res) => {
    res.set('Accept', 'GET, POST');
    res.status(405).json({ Error: "Cannot update all boats" });
});

/* ------------- End Boats Routes ------------- */

module.exports = router;