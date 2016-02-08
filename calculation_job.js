"use strict";
var argv = require('minimist')(process.argv.slice(2));
let CEE = require("./lib/cqm-execution-engine")
let mongoose = require("mongoose")
let Fiber = require('fibers');
let mongo = require('mongodb');
let MongoClient = mongo.MongoClient;
// need bundle locaation information so it can be loaded from the filesystem
// need to create a connection to mongodb in here to
// need to make sure mongoose is setup
let database = null;
let cqmEngine = null;


MongoClient.connect('mongodb://127.0.0.1:27017/fhir-test', function(err, db) {
  database = db;
  cqmEngine = new CEE(database, argv.bundle_path);
});

mongoose.connect('mongodb://127.0.0.1:27017/fhir-test');


/////////////////////////
// REQUIRE THE PACKAGE //
/////////////////////////

var NR = require("node-resque");

///////////////////////////
// SET UP THE CONNECTION //
///////////////////////////

var connectionDetails = {
  pkg: 'ioredis',
  host: '127.0.0.1',
  password: null,
  port: 6379,
  database: 0,
  // namespace: 'resque',
  // looping: true,
  // options: {password: 'abc'},
};

//////////////////////////////
// DEFINE YOUR WORKER TASKS //
//////////////////////////////

var jobs = {
  "rollup": {
    plugins: ['jobLock', 'queueLock'],
    pluginOptions: {
      jobLock: {},
    },
    perform: function(qr_id, callback) {
      QueryReport.find(qr_id).then((qr) => {
        if (!qr.patientsCalculated()){
          this.queueObject.enqueue("rollup","rollup",qr_id)
        }else{
          cqmEngine.count_records_in_measure_groups(qr);
        }
      });
      callback(null);
    }
  },
  "calculate": {
    plugins: ['jobLock', 'queueLock'],
    pluginOptions: {
      jobLock: {},
    },
    perform: function(qr_id, callback) {
      // is the a qr with the same measure_id, sub_id, effective_date already
      // finished ?  If so send to rollup queue.
      // if not send to the patient calculation queue and rollup queue
      QueryReport.find(qr_id).then((qr) => {
        if (qr.state == "calculating") {
          callback(null)
          return;
        }
        if (qr.patientsCalculated() && qr.status.state != "calculated") {
          // rollup the totals
          cqmEngine.count_records_in_measure_groups(qr);
          callback(null);
        } else if (qr.calculationQueuedOrRunning()) {
          // there is already a job running that will create the patient records
          // will wait unitl it is done
          qr.status.state = "queued";
          qr.save();
          callback(null);
        } else {
          // calculate the patient records then enque all of the queued
          // reports for aggregation -- in a separate que so this will only be to
          // calculate the patient records
          qr.status.state = "calculating";
          qr.save();
          QueryReport.find({
            measure_id: qr.measure_id,
            sub_id: qr.sub_id,
            effective_date: qr.effective_date,
            state: {
              "$ne": "calculated"
            }
          }).then((results) => {
            results.forEach((rep) => {
              this.queueObject.enqueue("rollup", "rollup", rep.id);
            })
          });
          callback(null, true);
        }
      });

    },
  }
};

////////////////////
// START A WORKER //
////////////////////

var connectionDetails = {
  pkg: "ioredis",
  host: "127.0.0.1",
  password: ""
}

var worker = new NR.multiWorker({
  connection: connectionDetails,
  queues: ['calculate', 'rollup'],
  minTaskProcessors: 1,
  maxTaskProcessors: 100,
  checkTimeout: 1000,
  maxEventLoopDelay: 10,
  toDisconnectProcessors: true,
}, jobs);
///////////////////////
// START A SCHEDULER //
///////////////////////

var scheduler = new NR.scheduler({
  connection: connectionDetails
});
scheduler.connect(function() {
  scheduler.start();
});

/////////////////////////
// REGESTER FOR EVENTS //
/////////////////////////

worker.on('start', function() {
  console.log("worker started");
});
worker.on('end', function() {
  console.log("worker ended");
});
worker.on('cleaning_worker', function(worker, pid) {
  console.log("cleaning old worker " + worker);
});
worker.on('poll', function(queue) {
  console.log("worker polling " + queue);
});
worker.on('job', function(queue, job) {
  console.log("working job " + queue + " " + JSON.stringify(job));
});
worker.on('reEnqueue', function(queue, job, plugin) {
  console.log("reEnqueue job (" + plugin + ") " + queue + " " + JSON.stringify(job));
});
worker.on('success', function(queue, job, result) {
  console.log("job success " + queue + " " + JSON.stringify(job) + " >> " + result);
});
worker.on('failure', function(queue, job, failure) {
  console.log("job failure " + queue + " " + JSON.stringify(job) + " >> " + failure);
});
worker.on('error', function(queue, job, error) {
  console.log("error " + queue + " " + JSON.stringify(job) + " >> " + error);
});
worker.on('pause', function() {
  console.log("worker paused");
});

scheduler.on('start', function() {
  console.log("scheduler started");
});
scheduler.on('end', function() {
  console.log("scheduler ended");
});
scheduler.on('poll', function() {
  console.log("scheduler polling");
});
scheduler.on('master', function(state) {
  console.log("scheduler became master");
});
scheduler.on('error', function(error) {
  console.log("scheduler error >> " + error);
});
scheduler.on('working_timestamp', function(timestamp) {
  console.log("scheduler working timestamp " + timestamp);
});
scheduler.on('transferred_job', function(timestamp, job) {
  console.log("scheduler enquing job " + timestamp + " >> " + JSON.stringify(job));
});

////////////////////////
// CONNECT TO A QUEUE //
////////////////////////
