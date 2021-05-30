const { Datastore } = require('@google-cloud/datastore');

module.exports.datastore = new Datastore();

/**
 * Function to query the results from the datastore based on the item KEY
 * @param {object} item from the datastore
 */
module.exports.fromDatastore = item => {
    item.id = item[Datastore.KEY].id;
    return item;
};

module.exports.Datastore;