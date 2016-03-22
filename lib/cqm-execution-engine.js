"use strict";
let Loader = require("node-qme").Loader;
let Bundle = require("node-qme").Bundle;
let Executor = require("node-qme").Executor;
let MeasureAggregator = require("./measure_aggregator")
let fhir = require("fhir-patient-api/lib/patient");
let Fiber = require('fibers');
let PatientSource = require("../lib/fhir-patient-source.js")
let PatientResultHandler = require("../lib/patient-result-handler.js")
let pre = require("../lib/prefilter.js")

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
    this.loader = new Loader(this.bundle);
    this.cqms = this.loader.load();
  }

  getMeasure(qualityReport) {
    let measure = null;
    for (var k in this.cqms) {
      measure = this.cqms[k];
      if (measure.hqmf_id == qualityReport.measure_id && measure.sub_id == qualityReport.sub_id) {
        return measure;
      }
    }
    return measure;
  }

  aggregate(qualityReport) {
    return this.measureAggregator.count_records_in_measure_groups(qualityReport);
  }

  buildPrefilter(measure, effective_date) {
    let prefilter = new pre.AggregatePrefilter("and");
    //let dc = {}
    var dc = measure.measure.hqmf_document.data_criteria;
    // for(var k in Object.keys(crit)){
    //   dc[k] = crit[k]
    // }
    for (var criteria_name in dc) {
      let data_criteria = dc[criteria_name];
      if (data_criteria["type"] == "characteristic") {
        prefilter.addFilter(this.filterCharacteristic(data_criteria,effective_date));
      }
    }
    return prefilter.buildQueryHash(effective_date);
  }

  filterCharacteristic(data_criteria,effective_date) {
    if (data_criteria['definition'] == 'patient_characteristic_birthdate') {
      if (data_criteria_in_population_ipp(measure, criteria_name)) {
        let filter = new pre.AggregatePrefilter("and");
        if (data_criteria['temporal_references']) {
          let prefilter = new pre.Prefilter({record_field: 'birthdate',
            effective_time_based: true})
          for (var tr in data_criteria['temporal_references']) {
            if (tr['type'] == 'SBS' && tr['reference'] == 'MeasurePeriod') {
              let years = nil
              if (tr['range']['high']) {
                prefilter.comparison = '$gte'
                prefilter.effective_time_quantity = tr['range']['high']['unit']
                years = tr['range']['high']['value'] + 1
              } else if (tr['range']['low']) {
                prefilter.comparison = '$lte'
                prefilter.effective_time_quantity = tr['range']['low']['unit']
                years = tr['range']['low']['value'] -1
              }
              prefilter.effective_time_offset = years
              filter.addFilter(prefilter);
            }
          }
        }
        return filter;
      }
    } else if (data_criteria['definition'] == 'patient_characteristic_gender') {
      var gender = data_criteria["value"]["code"] == "F" ?  "female" : "male"
      return new pre.Prefilter({record_field: 'gender', comparison: "$eq", desired_value: gender})
    }
  }

  calculate(qualityReport) {
    var measure = this.getMeasure(qualityReport);
    var filter = {} //buildPrefilter(measure,qualityReport.effective_date);
    var psource = new PatientSource(this.database, "patients" , filter)
    var options = {
        effective_date: qualityReport.effective_date,
        enable_logging: true,
        enable_rationale: false,
        short_circuit: true
      };
      var prHandler = new PatientResultHandler(this.database);
      var id = (measure.sub_id) ? measure.cms_id + measure.sub_id : measure.cms_id
      this.executor.execute(psource, [id], prHandler, options);
    //  this.aggregate(qualityReport);

  }



}
