"use strict";
let QualityReport = require("../lib/quality_report")
let MeasureAggregator = require("../lib/measure_aggregator")
let mongoose = require("mongoose");
let assert = require('assert');
let Loader = require("node-qme").Loader;
let Bundle = require("node-qme").Bundle;
let Executor = require("node-qme").Executor;
let fhir = require("fhir-patient-api/lib/patient");
let Fiber = require('fibers');
let mongo = require('mongodb');
let MongoClient = mongo.MongoClient;

mongoose.connect('mongodb://127.0.0.1:27017/fhir-test');
let bundle = null;
let bundle_path = "test/fixtures/bundle-2.7.0.zip";
let cqms = null;
let handler = null;
let PatientSource = require("../lib/fhir-patient-source.js")
let CQMCalculationHandler = require("../lib/cqm-calculation-handler.js")
let database = null;


let patient_cache = require("./fixtures/results/by_patient")
let query_cache = require("./fixtures/results/by_measure")

describe('MeasureAggregator', function () {
  this.timeout(0);
  before((done) => {
    bundle = new Bundle(bundle_path);
    var loader = new Loader(bundle);
    cqms = loader.load();

    MongoClient.connect('mongodb://127.0.0.1:27017/fhir-test', function (err, db) {
      database = db;
      db.collection("patient_cache").drop();
      db.collection("query_cache").drop();
      db.collection("patient_cache").insert(patient_cache).then((res) => {
        db.collection("query_cache").insert(query_cache).then((qres) => {
          done(err);
        })
      })

    });


  });

  after(() => {

  });

  it("should be able to build query pipeline ", (done) => {
    let measure_aggregator = new MeasureAggregator(database, cqms);
    QualityReport.find().then((res) => {
      res.forEach((rep) => {
        try {
          measure_aggregator.build_query(rep);
        } catch (e) {
          console.log(e);
        }
      })
      done();
    })
  });

  it("should be able to aggreagate query report", (done) => {
    let measure_aggregator = new MeasureAggregator(database, cqms);
    let qrcount = 0
    let result_count = 0;
    let errors = [];
    QualityReport.find().then((res) => {
      qrcount=res.length
      res.forEach((rep) => {
          measure_aggregator.count_records_in_measure_groups(rep).then((results) => {
            // match results to those of the quality report which was generated from
            // ruby based qme
            let inital_results = rep.result
            for (var p in results) {
              try {
                if ((p != "_id" && p != "defaults" && p != "population_ids")) {
                  assert.equal(inital_results[p], results[p] , p + " " + inital_results[p] + "should equal " + results[p])
                }
                  // console.log(p + " "+rep.result[p] + "should equal " + results[p]);
                //  assert.equal(rep.result[p],results[p], p +" should be ")
              } catch (e) {
                errors.push(e)
              }
            }
            //console.log(results);
            result_count++;
            if(result_count == qrcount){
              assert.equal(errors.length, 0, "should be 0 errors from regression testing");
              done();
            }
          }).catch((err) => {
            console.log("rejected");
            console.log(errors);
            done();
          });
        })
        //done();
    })
  });

});
