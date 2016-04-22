 "use strict";
var params = require('optimist')
  .options({
    "h": {
      describe: "help",
      alias: "h"
    },
    "q": {
      alias: "queues",
      describe: "which redis queues to monitor , format is q1:q2:q3 ",
      default: 'calculate:rollup'
    },
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
    },
    "r": {
      alias: "redis",
      describe: "the redis server used to store the background processing jobs",
      default: "127.0.0.1"
    }
  })

var argv = params.argv

let CEE = require("./lib/cqm-execution-engine")
let mongoose = require("mongoose")
let Fiber = require('fibers');
let mongo = require('mongodb');
let MongoClient = mongo.MongoClient;
let QualityReport = require("./lib/quality_report")
let MeasureSource = require("node-qme/lib/mongo/measure_source")
  // need bundle locaation information so it can be loaded from the filesystem
  // need to create a connection to mongodb in here to
  // need to make sure mongoose is setup
let database = null;
let cqmEngine = null;
let bundle_path = argv.bundle;
let mongo_host = argv.mongo_host;
let mongo_database = argv.database;
let redis_host = argv.redis_host;
let mongo_url = "mongodb://" + mongo_host + "/" + mongo_database;
let queues = argv.queues.split(":")
MongoClient.connect(mongo_url, function (err, db) {
  database = db;

  var source =  null;
  if(bundle_path) {
    source = new Bundle(bundle_path);
  }else{
    source = new MeasureSource(db);
  }
  source.loadUtils();
  cqmEngine = new CEE(database,source);
});

mongoose.connect(mongo_url);

/////////////////////////
// REQUIRE THE PACKAGE //
/////////////////////////

var NR = require("node-resque");

global.print = function (data) {
    //  console.log(data);
  }
  //////////////////////////////
  // DEFINE YOUR WORKER TASKS //
  //////////////////////////////

var jobs = {
  "rollup": {
    plugins: ['jobLock', 'queueLock'],
    pluginOptions: {
      jobLock: {},
    },
    perform: function (qr_id, callback) {
      QualityReport.findOne({
        "_id": qr_id
      }).then((qr) => {
        cqmEngine.aggregate(qr).then((res) => {
          qr.setResultsAndMarkCompleted(res);
          callback(null, res);
        }).catch((err) => {
          qr.markFailed(err.toString());
          callback(err, null);
        });
      }).catch((err) => {
        callback(err, null)
      });
    }
  },
  "calculate": {
    plugins: ['jobLock', 'queueLock'],
    pluginOptions: {
      jobLock: {},
    },
    perform: function (qr_id, callback) {

     /* prepare for callback hell:
      first find the quality report for this job
      */
      QualityReport.findOne({
        "_id": qr_id
      }).then((qr) => {
        //callback error if there is no quailty report for the id declared in the job
        if (!qr) {
          callback("Quality Report not found for id "+ qr_id);
          return;
        }
        //make sure the status of the job is appropriate for patient level calculation
        //if not just return -- make sure to call the callback to let reque know we are done
        if (qr.status.state != "" && qr.status.state != "requested") {
          callback(null)
          return;
        }
        //count the number of similar (measure_id,sub_id,effective_date) quailty reports that are currently
        // queued, running or done. if this is greater than 0 then something else is already calculating the
        // patient level results for this report
        QualityReport.queuedRunningOrDone(qr).then((count)=> {
          // there is already another working working on calculating the patients for this measure_id,sub_id,effective_date combo
          if (count != 0) {
            // mark it for qollup quing
            qr.status.state = "queued";
            qr.save();
            this.queueObject.enqueue("rollup", "rollup", qr.id);
            callback(null,true);
          } else {
            // calculate the patient level results
            // this needs to happen in a fiber for db access to the patients
            new Fiber(() => {
              // time to calculate the pateint results
              qr.status.state = "calculating";
              qr.save();
              // calculate patient level records
              // this should be blocking
              try {
                cqmEngine.calculate(qr);
              } catch (err) {
                //calculation failed
                qr.markFailed(e.toString());
                callback(e,null);

              }
              //set all of the reports with the same measure_id,sub_id,effective_date as the qr to queued
              // and push them to the rollup queue
              QualityReport.markForRollup(qr).then((results) => {
                results.forEach((rep) => {
                  this.queueObject.enqueue("rollup", "rollup", rep.id);
                });
                // now that all of the reports are queued for rollup aggregation call the callback
                // to let this worker run another job
                callback(null, true);
              }).catch((err) => {
                //something went wrong -- mark the report as faild and save it
                qr.markFailed(err.toString());
                callback(err, null);
              });
            }).run();
          }
        });
      }).catch((err) => {
        callback(err, null)
      });

    }
  }
};

////////////////////
// START A WORKER //
////////////////////

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

var worker = new NR.worker({
  connection: connectionDetails,
  queues: queues,
  minTaskProcessors: 1,
  maxTaskProcessors: 10,
  checkTimeout: 1000,
  maxEventLoopDelay: 10,
  toDisconnectProcessors: true,
}, jobs);

worker.connect(function () {
  worker.workerCleanup(); // optional: cleanup any previous improperly shutdown workers on this host
  worker.start();
});
///////////////////////
// START A SCHEDULER //
///////////////////////

// var scheduler = new NR.scheduler({
//   connection: connectionDetails
// });
// scheduler.connect(function () {
//   scheduler.start();
// });

/////////////////////////
// REGESTER FOR EVENTS //
/////////////////////////

worker.on('start', function () {
  console.log("worker started " + this.name);
});
worker.on('end', function () {
  console.log("worker ended " + this.name);
});
worker.on('cleaning_worker', function (worker, pid) {
  console.log("cleaning old worker " + worker);
});
worker.on('poll', function (queue) {
  console.log("worker polling " + queue + " " + " " + this.name);
});
worker.on('job', function (queue, job) {
  console.log("working job " + queue + " " + JSON.stringify(job));
});
worker.on('reEnqueue', function (queue, job, plugin) {
  console.log("reEnqueue job (" + plugin + ") " + queue + " " + JSON.stringify(job));
});
worker.on('success', function (queue, job, result) {
  console.log("job success " + queue + " " + JSON.stringify(job) + " >> " + result);
});
worker.on('failure', function (queue, job, failure) {
  console.log("job failure " + queue + " " + JSON.stringify(job) + " >> " + failure);
});
worker.on('error', function (queue, job, error) {
  console.log("error " + queue + " " + JSON.stringify(job) + " >> " + error);
});
worker.on('pause', function () {
  console.log("worker paused");
});
//
// scheduler.on('start', function () {
//   console.log("scheduler started");
// });
// scheduler.on('end', function () {
//   console.log("scheduler ended");
// });
// scheduler.on('poll', function () {
//   console.log("scheduler polling");
// });
// scheduler.on('master', function (state) {
//   console.log("scheduler became master");
// });
// scheduler.on('error', function (error) {
//   console.log("scheduler error >> " + error);
// });
// scheduler.on('working_timestamp', function (timestamp) {
//   console.log("scheduler working timestamp " + timestamp);
// });
// scheduler.on('transferred_job', function (timestamp, job) {
//   console.log("scheduler enquing job " + timestamp + " >> " + JSON.stringify(job));
// });
