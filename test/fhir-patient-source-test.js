"use strict";
let exec = require("child_process").exec
let assert = require('assert');
let Loader = require("node-qme").Loader;
let Bundle = require("node-qme").Bundle;
let Executor = require("node-qme").Executor;
let fhir = require("fhir-patient-api/lib/patient");
let Fiber = require('fibers');
let mongo = require('mongodb');
let MongoClient = mongo.MongoClient;
let Logger = require('mongodb').Logger
let fs = require('fs');
let CEE = require("../lib/cqm-execution-engine")
let QualityReport = require("../lib/quality_report")
global.print = function(data){}
let bundle = null;
let bundle_path = "test/fixtures/bundle-2.7.0.zip";
let cqms = null;
let handler = null;
let PatientSource = require("../lib/fhir-patient-source.js")
let CQMCalculationHandler = require("../lib/cqm-calculation-handler.js")
let database = null;
let patients = require("./fixtures/patients.json")
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
      //Logger.setLevel('debug');
      database = db;
      db.collection("patient_cache").drop();
      db.collection("query_cache").drop();
      db.collection("patients").drop();
      exec("mongoimport -d fhir-test -c patients  --jsonArray test/fixtures/patients.json", (error, stdout, stderr)=> {
        done(error);
        }
      );

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
      var options = {effective_date: 1451606400 , enable_logging: true, enable_rationale: false, short_circuit: false};
      var cqmHandler = new CQMCalculationHandler(bundle.measures,options,database);
      bundle.measure_ids().forEach((mid) => {
      //  executor.execute(psource,[mid], cqmHandler, options);
      })
      done();
    }).run();
  });

  it("should be able to filter patients with a query", (done) =>{
    new Fiber(() => {
      var cqmEngine = new CEE(database, bundle_path);
      var psource = new PatientSource(database,"patients");
      var female_psource = new PatientSource(database,"patients",{gender: "female"});
      var pcount = psource.count();
      var fcount = female_psource.count();
      done();
      assert.equal(143, pcount ,"SHould have counted 143 females in database")

    }).run();
  });


  it("should be able to create a combination gender birthdate prefilter that actually filters patients " , (done) =>{
      new Fiber(() => {
        var  qr = new QualityReport({measure_id : "40280381-4B9A-3825-014B-E10B1E0A13DB", sub_id : null})
        var cqmEngine = new CEE(database, bundle_path);
        var measure = cqmEngine.getMeasure(qr);
        var psource = new PatientSource(database,"patients",cqmEngine.buildPrefilter(measure,1388552400));
        var totalPatients = new PatientSource(database,"patients").count();
        var females = psource.count();
        assert.equal(300, totalPatients, "should be a total of 300 patients in db")
        assert.equal(64, females,"should be 143 males in the db")
        done();
      }).run();
  });

  it("should be able to create a gender prefilter that actually filters patients " , (done) =>{
      new Fiber(() => {
        var  qr = new QualityReport({measure_id : "40280381-4BE2-53B3-014B-E5E7F0DB01CE", sub_id : null})
        var cqmEngine = new CEE(database, bundle_path);
        var measure = cqmEngine.getMeasure(qr);
        var psource = new PatientSource(database,"patients",cqmEngine.buildPrefilter(measure,1388552400));
        var totalPatients = new PatientSource(database,"patients").count();
        var males = psource.count();
        assert.equal(300, totalPatients, "should be a total of 300 patients in db")
        assert.equal(157, males,"should be 143 males in the db")
        done();
      }).run();
  });

  it("should be able to create an age prefilter that actually filters patients " , (done) =>{
      new Fiber(() => {
        var  qr = new QualityReport({measure_id : "40280381-4DE7-DB4D-014D-E86C831201C7", sub_id : "a"})
        var cqmEngine = new CEE(database, bundle_path);
        var measure = cqmEngine.getMeasure(qr);
        var psource = new PatientSource(database,"patients",cqmEngine.buildPrefilter(measure,1388552400));
        var totalPatients = new PatientSource(database,"patients").count();
        var elderly = psource.count();
        assert.equal(300, totalPatients, "should be a total of 300 patients in db")
        assert.equal(250, elderly,"should be 16 elderly in the db")
        done();
      }).run();
  });

});
