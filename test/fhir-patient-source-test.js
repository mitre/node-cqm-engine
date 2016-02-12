"use strict";

let assert = require('assert');
let Loader = require("node-qme").Loader;
let Bundle = require("node-qme").Bundle;
let Executor = require("node-qme").Executor;
let fhir = require("fhir-patient-api/lib/patient");
let Fiber = require('fibers');
let mongo = require('mongodb');
let MongoClient = mongo.MongoClient;
let fs = require('fs');

global.print = function(data){}
let bundle = null;
let bundle_path = "test/fixtures/bundle-2.7.0.zip";
let cqms = null;
let handler = null;
let PatientSource = require("../lib/fhir-patient-source.js")
let CQMCalculationHandler = require("../lib/cqm-calculation-handler.js")
let database = null;

class Handler{
  constructor(){
    this.results = [];
    this.start_called = false;
    this.finished_called = false;
  }

  start(){
    this.results=[];
    this.start_called = true;
  }

  handleResult(result){
    this.results.push(result);
  }

  finished(){
    this.finished_called = true;
  }

}

describe('Patient', function() {
 this.timeout(0);
  before((done) => {
    bundle = new Bundle(bundle_path);
    var loader = new Loader(bundle);
    cqms = loader.load();
    handler = new Handler();
    MongoClient.connect('mongodb://127.0.0.1:27017/fhir-test', function(err, db) {
      database = db;
      db.collection("patient-cache").drop();
      db.collection("query-results").drop();
      done(err);
    });


    });

  after(()=>{

  });

  it("should be able to calulate patient records ", (done) =>{
    new Fiber(() => {
      var psource = new PatientSource(database,"patients")
      var executor = new Executor(cqms);
      var options = {effective_date: 1451606400 , enable_logging: false, enable_rationale: false, short_circuit: false};
      executor.execute(psource,['CMS113v4'], handler, options);
      done();
    }).run();
  });

  it("should be able to calulate patient records and put them in the database", (done) =>{
    new Fiber(() => {
      var psource = new PatientSource(database)
      var executor = new Executor(cqms);
      var options = {effective_date: 1451606400 , enable_logging: false, enable_rationale: false, short_circuit: false};
      var cqmHandler = new CQMCalculationHandler(bundle.measures,options,database);
      executor.execute(psource,bundle.measure_ids(), cqmHandler, options);
      done();
    }).run();
  });
});
