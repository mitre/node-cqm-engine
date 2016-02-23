"use strict";
var params = require('optimist')
  .options({
    "h": {
      describe: "help",
      alias: "h"
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

let mongoose = require("mongoose")
let QualityReport = require("./lib/quality_report")
let mongo_host = argv.mongo_host;
let mongo_database = argv.database;
let redis_host = argv.redis_host;
let mongo_url = "mongodb://" + mongo_host + "/" + mongo_database;
let NR = require("node-resque");



mongoose.connect(mongo_url);


var connectionDetails = {
  pkg: 'ioredis',
  host: argv.redis_host,
  password: null,
  port: 6379,
  database: 0,
  // namespace: 'resque',
  // looping: true,
  // options: {password: 'abc'},
};

var queue = new NR.queue({
  connection: connectionDetails
});
queue.on('error', function (error) {
  console.log(error);
});
queue.connect()
let poll = function () {
  console.log("polling for new quality reports");
  QualityReport.find({
    "status.state": "requested"
  }).then((qrs) => {
    qrs.forEach((qr) => {
      console.log("push qr to queue "+qr.id);
      queue.enqueue("calculate","calculate",qr.id);
    });
    setTimeout(poll,10000);
  }).catch((err)=>{
    console.log(err);
    setTimeout(poll,10000);
  });
}

setTimeout(poll, 1000);
