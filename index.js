"use strict";
var params = require('optimist')
  .options({
    "h": {
      describe: "help",
      alias: "h"
    },
    "c": {
      alias: "cp",
      describe: "number of patient calculation processors",
      default: 10
    },
    "a": {
      alias: "ap",
      describe: "number of aggregation processors",
      default: 4
    },
    "b": {
      alias: "bundle",
      describe: "path to the bundle to use for measure calculation [file path] ",
      demand: true
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
    },
    "r": {
      alias: "redis",
      describe: "the redis server used to store the background processing jobs",
      default: "127.0.0.1"
    }
  })

var argv = params.argv


// how many calculation processors
// how many rollup processors
// db url
// redis url
let calculation_processors = argv.cp
let rollup_processors = argv.ap
let mongo_host = argv.mongo_host
let mongo_database = argv.database
let redis_host = argv.redis
let bundle_path = argv.bundle

// make sure the bundle path is available
// make sure that the
let child_process = require("child_process")
console.log(argv);
// start the rollup processors
for(var i=0; i<rollup_processors; i++){
  child_process.fork("./calculation_job.js", ["--queues","rollup","--mongo_host",mongo_host,"--database",mongo_database, "--redis_host",redis_host, "--bundle",bundle_path])
}

// start the rollup processors
for(var i=0; i<calculation_processors; i++){
  child_process.fork("./calculation_job.js", ["--queues","calculate","--mongo_host",mongo_host,"--database",mongo_database, "--redis_host",redis_host, "--bundle",bundle_path])
}
