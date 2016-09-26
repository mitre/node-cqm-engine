"use strict";
var params = require('optimist')
  .options({
    "b": {
      alias: "bundle",
      describe: "path to the bundle to use for measure calculation [file path] "
    },
    "m": {
      alias: "mongo_host",
      describe: "the host of the mongodb server that contains the fhir patient data and where patient values will be stored ",
      default: "127.0.0.1"
    },
    "d": {
      alias: "database",
      describe: "the mongodb database",
      default: "fhir"
    }
  });

const argv = params.argv

const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;
const Bundle = require("node-qme").Bundle;
const MongoBundleLoader = require("node-qme/lib/mongo/bundle_loader");

let bundle_path = argv.bundle;
let mongo_host = argv.mongo_host;
let mongo_database = argv.database;
let mongo_url = `mongodb://${mongo_host}/${mongo_database}`;

const bundleToLoad = new Bundle(bundle_path);
MongoClient.connect(mongo_url, function (err, db) {
  const loader = new MongoBundleLoader(db, bundleToLoad);
  loader.loadBundle();
  db.close();
});
