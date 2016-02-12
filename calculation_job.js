"use strict";
var argv = require('minimist')(process.argv.slice(2));
let CEE = require("./lib/cqm-execution-engine")
let mongoose = require("mongoose")
let Fiber = require('fibers');
let mongo = require('mongodb');
let MongoClient = mongo.MongoClient;
let QualityReport = require("./lib/quality_report")
  // need bundle locaation information so it can be loaded from the filesystem
  // need to create a connection to mongodb in here to
  // need to make sure mongoose is setup
let database = null;
let cqmEngine = null;
let bundle_path = "./test/fixtures/bundle-2.7.0.zip";

MongoClient.connect('mongodb://127.0.0.1:27017/fhir-test', function (err, db) {
  database = db;
  cqmEngine = new CEE(database, bundle_path);
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
    perform: function (qr_id, callback) {
      QualityReport.findOne({"_id" : qr_id}).then((qr) => {
        cqmEngine.aggregate(qr).then((res) =>{
          console.log(res);
          qr.status.state = "completed";
          qr.result = res
          qr.save()
          callback(null, res);
        }).catch((err) =>{callback(err, null)});

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
      console.log("hey");
      // is the a qr with the same measure_id, sub_id, effective_date already
      // finished ?  If so send to rollup queue.
      // if not send to the patient calculation queue and rollup queue
      QualityReport.findOne({"_id" : qr_id}).then((qr) => {
      //  console.log(qr);
        if (qr.status.state != "" && qr.status.state != "unknown") {
          callback(null)
          return;
        }
        database.collection("quality-reports").aggregate([
          {"$match" : {
            "effective_date" : qr.effective_date,
            "measure_id" : qr.measure_id,
            "sub_id" : qr.sub_id
          }},
          {
          $group: {
            _id: "$status.state",
            count: {
              $sum: 1
            }
          }
        }]).toArray((err, results) => {
          //console.log(results);
          console.log("aggregate");
          if (err) {
            callback(err, null);
            return;
          }
          let queuedRunningOrDone = 0;
          if (results) {
            results.forEach((item) => {
              let key = item['_id'];
              if (key == "completed" || key == "calculating" || key == "queued") {
                queuedRunningOrDone += item["count"]
              }
            });

          }
          if (queuedRunningOrDone != 0) {
            console.log("queuedRunningOrDone");
            qr.status.state = "queued";
            qr.save();
            this.queueObject.enqueue("rollup", "rollup", qr.id);
          } else {
            console.log("calculate");
            // if calculating || completed || queued > 0
            qr.status.state = "calculating";
            qr.save();

            // calculate patient level records
            // this should be blocking
            cqmEngine.calculate(qr);
            // push all queued reports to the rollup queue
            QualityReport.find({
              measure_id: qr.measure_id,
              sub_id: qr.sub_id,
              effective_date: qr.effective_date,
              "status.state": {
                "$ne": "calculated"
              }
            }).then((results) => {
              results.forEach((rep) => {
                rep.status.state = "queued";
                rep.save();
                this.queueObject.enqueue("rollup", "rollup", rep.id);
              });
              callback(null, true);
            }).catch((err) => {
              callback(err, null);
            });
          }

        })
      }).catch((err) => {
        console.log("errors");
        callback(err, null)
      });
    }
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

worker.start()
  ///////////////////////
  // START A SCHEDULER //
  ///////////////////////

var scheduler = new NR.scheduler({
  connection: connectionDetails
});
scheduler.connect(function () {
  scheduler.start();
});

/////////////////////////
// REGESTER FOR EVENTS //
/////////////////////////

worker.on('start', function () {
  console.log("worker started");
});
worker.on('end', function () {
  console.log("worker ended");
});
worker.on('cleaning_worker', function (worker, pid) {
  console.log("cleaning old worker " + worker);
});
worker.on('poll', function (queue) {
  console.log("worker polling " + queue);
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

scheduler.on('start', function () {
  console.log("scheduler started");
});
scheduler.on('end', function () {
  console.log("scheduler ended");
});
scheduler.on('poll', function () {
  console.log("scheduler polling");
});
scheduler.on('master', function (state) {
  console.log("scheduler became master");
});
scheduler.on('error', function (error) {
  console.log("scheduler error >> " + error);
});
scheduler.on('working_timestamp', function (timestamp) {
  console.log("scheduler working timestamp " + timestamp);
});
scheduler.on('transferred_job', function (timestamp, job) {
  console.log("scheduler enquing job " + timestamp + " >> " + JSON.stringify(job));
});

////////////////////////
// CONNECT TO A QUEUE //
////////////////////////

var queue = new NR.queue({
  connection: connectionDetails
}, jobs);
queue.on('error', function (error) {
  console.log(error);
});
queue.connect(function () {
  queue.enqueue('calculate', "calculate", "56bba3a22aa90b6cd06261a2");
});
