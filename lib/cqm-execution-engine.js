"use strict";
let Loader = require("node-qme").Loader;
let Bundle = require("node-qme").Bundle;
let Executor = require("node-qme").Executor;
let MeasureAggregator = require("./measure_aggregator")
let fhir = require("fhir-patient-api/lib/patient");
let Fiber = require('fibers');
let PatientSource = require("../lib/fhir-patient-source.js")
let PatientResultHandler = require("../lib/patient-result-handler.js")
module.exports = class CQMExecutionEngine {

  constructor(db, bundle_path) {
    this.bundle_path = bundle_path;
    this.database = db;
    this.loadBundle();
    this.measureAggregator = new MeasureAggregator(db, this.cqms);
    this.executor = new Executor(this.cqms);
  }

  loadBundle() {
    this.bundle = new Bundle(this.bundle_path);
    var loader = new Loader(this.bundle);
    this.cqms = loader.load();
  }

  getMeasure(qualityReport) {
    let measure = null;
    Object.keys(this.cqms).some((k) => {
      measure = this.cqms[k];
      if (measure.hqmf_id == qualityReport.measure_id && measure.sub_id == qualityReport.sub_id) {
        return measure;
      }
    })
    return measure;
  }

  aggregate(qualityReport) {
    return this.measureAggregator.count_records_in_measure_groups(qualityReport);
  }

  calculate(qualityReport) {
    new Fiber(() => {
      var psource = new PatientSource(this.database)
      var options = {
        effective_date: qualityReport.effective_date,
        enable_logging: false,
        enable_rationale: false,
        short_circuit: true
      };
      var prHandler = new PatientResultHandler(this.database);
      var measure = this.getMeasure(qualityReport);
      var id = measure.cms_id + measure.sub_id
      console.log("CMS ID " +id);
      this.executor.execute(psource,[id], prHandler, options);
      this.aggregate(qualityReport);
    }).run();
  }



}
