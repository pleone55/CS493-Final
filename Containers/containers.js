const express = require('express');
const bodyParser = require('body-parser');

const CONTAINERS = "Containers";
const BOATS = "Boats";

const ds = require('../Datastore/datastore');
const datastore = ds.datastore;

const router = express.Router();
router.use(bodyParser.json());

/* ------------- Begin Containers Model ------------- */

/**
 * 
 * @param {number} number of the container
 * @param {number} weight of the container
 * @param {string} content of the container
 * @returns the key of the container created
 */
const createContainer = (number, weight, content) => {
    const key = datastore.key(CONTAINERS);
    const newContainer = {
        number: number,
        weight: weight,
        content: content,
        boat: {
            id: null,
            name: null
        }
    };
    return datastore.save({
        key: key,
        data: newContainer
    })
    .then(() => { return key });
};

/**
 * Function to return all containers
 * @param {object} req the request of the current url implemented to route to the next
 * list of containers after the limit of 5 is reached on the page
 * @returns all containers
 */
const getAllContainers = req => {
    var query = datastore.createQuery(CONTAINERS).limit(5);
    const results = {};

    //check if the query includes 'cursor'
    if(Object.keys(req.query).includes("cursor")) {
        query = query.start(req.query.cursor);
    }
    return datastore.runQuery(query)
        .then(entities => {
            var count = entities[0].map(ds.fromDatastore).length;
            //set the results to the results from the datastore
            results.items = entities[0].map(ds.fromDatastore);
            const containers = entities[0].map(ds.fromDatastore);
            if(entities[1].moreResults !== ds.datastore.NO_MORE_RESULTS) {
                results.next = `${req.protocol}://${req.get("host")}${req.baseUrl}?cursor=${entities[1].endCursor}`;
            }
            for(let i = 0; i < containers.length; i++) {
                results.items[i].self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${containers[i].id}`;
            }
            results.items.push({
                containers: count
            });
            return results;
        });
};

/**
 * Function that returns a container by the id
 * @param {object} req of the current url for the self link
 * @param {string} id of the container
 * @returns the container specified by the id 
 */
const getContainer = (req, id) => {
    const key = datastore.key([CONTAINERS, parseInt(id, 10)]);
    const query = datastore.createQuery(CONTAINERS).filter('__key__', '=', key);
    return datastore.runQuery(query)
        .then(results => {
            var keyContainer = results[0].map(ds.fromDatastore);
            if(keyContainer[0] != null) {
                keyContainer[0].self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${key.id}`;
                return keyContainer[0];
            }
        });
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
 * 
 * @param {string} id of the container to patch
 * @param {number} number of the patched container
 * @param {number} weight of the patched container
 * @param {string} content of the patched container
 * @returns the updated container with the updated attributes
 */
const patchContainer = async (id, number, weight, content) => {
    const key = datastore.key([CONTAINERS, parseInt(id, 10)]);
    const container = await getContainerForUpdateAndDelete(id);
    const { boat } = container[0];
    const newContainer = {
        number: number,
        weight: weight,
        content: content,
        boat: boat
    };
    return datastore.update({
        key: key,
        data: newContainer
    }).then(() => { return key });
};

/**
 * 
 * @param {string} id of the container to patch
 * @param {number} number of the patched container
 * @param {Number} weight of the patched container
 * @param {string} content of the patched container
 * @returns the updated container with the updated attributes
 */
const putContainer = async (id, number, weight, content) => {
    const key = datastore.key([CONTAINERS, parseInt(id, 10)]);
    const container = await getContainerForUpdateAndDelete(id);
    const { boat } = container[0];
    const newContainer = {
        number: number,
        weight: weight,
        content: content,
        boat: boat
    };
    return datastore.update({
        key: key,
        data: newContainer
    }).then(() => { return key });
};

/**
 * 
 * @param {string} id of the container
 */
const deleteContainer = id => {
    const key = datastore.key([CONTAINERS, parseInt(id, 10)]);
    return datastore.delete(key);
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

/* ------------- End Containers Model ------------- */

/* ------------- Begin Containers Routes ------------- */

//Create Container
router.post('/', (req, res) => {
    if(req.get('Content-Type') !== 'application/json') {
        res.status(415).json({ Error: 'Server only accepts application/json data.' });
    }
    const { number, weight, content } = req.body;
    if(!number || !weight || !content) {
        res.status(400).json({ Error: "The request object is missing at least one of the required attributes." });
    } else {
        createContainer(number, weight, content)
            .then(key => {
                container = {
                    id: key.id,
                    number: number,
                    weight: weight,
                    content: content,
                    boat: {
                        id: null,
                        name: null,
                        self: null
                    },
                    self: `${req.protocol}://${req.get("host")}${req.baseUrl}/${key.id}`
                };
                res.status(201).json(container);
            })
            .catch(() => {
                res.status(400).json({ Error: "Could not create container" });
            });
    }
});

//Get All Containers
router.get('/', (req, res) => {
    getAllContainers(req)
        .then(containers => {
            res.status(200).json(containers)
        })
        .catch(() => {
            res.status(400).json({ Error: "Could not receive containers" });
        });
});

//Get a Container
router.get('/:container_id', (req, res) => {
    getContainer(req, req.params.container_id)
        .then(container => {
            if(container) {
                const accepts = req.accepts('application/json');
                if(!accepts) {
                    res.status(406).json({ Error: "Not Acceptable" });
                } else if(accepts === 'application/json') {
                    res.status(200).json(container);
                } else {
                    res.status(500).json({ Error: 'Internal Server Error' });
                }
            } else {
                res.status(404).json({ Error: "No container with container_id exists" });
            }
        });
});

//Patch a Container
router.patch('/:container_id', (req, res) => {
    if(req.get('Content-Type') !== 'application/json') {
        res.status(415).json({ Error: 'Server only accepts application/json data.' });
    }
    if(Object.keys(req.body).indexOf("boat") > -1) {
        res.status(400).json({ Error: "Cannot update the boat property directly." });
    } else {
        getContainerForUpdateAndDelete(req.params.container_id)
            .then(container => {
                let { number, weight, content } = req.body;
                if(!number) {
                    number = container[0].number;
                }
                if(!weight) {
                    weight = container[0].weight;
                }
                if(!content) {
                    content = container[0].content
                }
                patchContainer(req.params.container_id, number, weight, content)
                    .then(() => {
                        res.status(204).end();
                    })
                    .catch(() => {
                        res.status(400).json({ Error: "Could not patch container" });
                    });
            })
            .catch(() => {
                res.status(404).json({ Error: "No container with container_id exists" });
            });
    }
});

//Update a container entity
router.put('/:container_id', (req, res) => {
    if(req.get('Content-Type') !== 'application/json') {
        res.status(415).json({ Error: 'Server only accepts application/json data.' });
    }
    if(Object.keys(req.body).indexOf("boat") > -1) {
        res.status(400).json({ Error: "Cannot update the boat property directly." });
    } else {
        let { number, weight, content } = req.body;
        if(number && weight && content) {
            getContainerForUpdateAndDelete(req.params.container_id)
                .then(container => {
                    if(!container[0]) {
                        res.status(404).json({ Error: "No container with container_id exists" });
                    } else {
                        putContainer(req.params.container_id, number, weight, content)
                            .then(() => {
                                res.status(204).end();
                            })
                            .catch(() => {
                                res.status(400).json({ Error: "Could not update entity" });
                            });
                    }
                });
        } else {
            res.status(400).json({ Error: "The request object is missing at least one of the required attributes." });
        }
    }
});

//Delete Containers
router.delete('/:container_id', (req, res) => {
    getContainerForUpdateAndDelete(req.params.container_id)
        .then(container => {
            if(!container[0]) {
                res.status(404).json({ Error: "No container with container_id exists" });
            } else {
                const boat_id = container[0].boat.id;
                if(boat_id !== null) {
                    removeContainerFromBoat(res, boat_id, req.params.container_id)
                }
                deleteContainer(req.params.container_id)
                    .then(res.status(204).end());
            }
        });
});

//Delete all Containers
router.delete('/', (req, res) => {
    res.set('Accept', 'GET, POST');
    res.status(405).json({ Error: "Cannot delete all containers" });
});

//Update All Containers
router.put('/', (req, res) => {
    res.set('Accept', 'GET, POST');
    res.status(405).json({ Error: "Cannot update all containers" });
});

/* ------------- End Containers Routes ------------- */

module.exports = router;