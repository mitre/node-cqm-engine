"use strict";


let Executor = require("node-qme").Executor;
let MeasureAggregator = require("./measure_aggregator")
let fhir = require("fhir-patient-api/lib/patient");
let Fiber = require('fibers');
let PatientSource = require("../lib/fhir-patient-source.js")
let PatientResultHandler = require("../lib/patient-result-handler.js")
let pre = require("../lib/prefilter.js")

module.exports = class CQMExecutionEngine {

  constructor(db, measure_source) {
    this.measure_source = measure_source;
    this.database = db;
    this.measureAggregator = new MeasureAggregator(db, this.measure_source);
    this.executor = new Executor(this.measure_source);
  }

  loadBundle() {
    this.bundle = new Bundle(this.bundle_path);
    this.loader = new Loader(this.bundle);
    this.cqms = this.loader.load();
  }

  /*
  Retrieves a measure from the measure source based on the measure_id and sub_id declared in the quality report passed in .
  @params {QualityReport} qualityReport -- the qualityReport
  @returns {object} a measure object
  */
  getMeasure(qualityReport) {
    var def = this.measure_source.getMeasure(qualityReport.measure_id , qualityReport.sub_id)
    return def;
  }

  /*
   performs the aggregation of patient level results for the given qualityReport
   @params {QualityReport} qualityReport
   */
  aggregate(qualityReport) {
    return this.measureAggregator.count_records_in_measure_groups(qualityReport);
  }

  /*
   Builds a prefilter to select patients based off of age and gender critiera defined in the measure.
   @param {object} measure -- Measure object that contains the measures definition and criteria
   @param {integer} effective_date --  The date that age is to be determined in reference to
   @retuns {PreFilter} a prefilter that creates a mongodb query filter
   */
  buildPrefilter(measure, effective_date) {
    let prefilter = new pre.AggregatePrefilter("and");
    //let dc = {}
    var dc = measure.measure.hqmf_document.data_criteria;
    // for(var k in Object.keys(crit)){
    //   dc[k] = crit[k]
    // }
    for (var criteria_name in dc) {
      let data_criteria = dc[criteria_name];

      if (data_criteria["type"] == "characteristic" && this.data_criteria_in_population("IPP",measure,criteria_name)) {
        prefilter.addFilter(this.filterCharacteristic(measure, data_criteria, criteria_name, effective_date));
      }
    }
    return prefilter.buildQueryHash(effective_date);
  }

  /*
   Generates individual prefilter criteria
   */
  filterCharacteristic(measure, data_criteria,criteria_name,effective_date) {

    if (data_criteria['definition'] == 'patient_characteristic_birthdate') {
      if (this.data_criteria_in_population("IPP", measure, criteria_name )) {
        let filter = new pre.AggregatePrefilter("and");
        if (data_criteria['temporal_references']) {
          let prefilter = new pre.Prefilter({record_field: 'birthDate.time',
            effective_time_based: true})
          for (var tri in data_criteria['temporal_references']) {
            var tr = data_criteria.temporal_references[tri];
            if (tr['type'] == 'SBS' && tr['reference'] == 'MeasurePeriod') {
              let years = null
              if (tr['range']['high']) {
                prefilter.comparison = '$gte'
                prefilter.effective_time_quantity = tr['range']['high']['unit']
                years = parseInt(tr['range']['high']['value']) + 1
              } else if (tr['range']['low']) {
                prefilter.comparison = '$lte'
                prefilter.effective_time_quantity = tr['range']['low']['unit']
                years = parseInt(tr['range']['low']['value']) -1
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

  /*
   is the given criteria_name contained in the given population (IPP,DENOM ...) in the given measure.  Used during creation of prefilters.
   */
  data_criteria_in_population(population_id, measure, criteria_name){

    return this.criteria_in_precondition( measure.measure.hqmf_document.population_criteria[population_id].preconditions, criteria_name)
  }

  /*
  is the criteria_name containted in the given precondition .. used during prefilter creation
  */
  criteria_in_precondition(preconditions, criteria_name){
    var found = false;
    preconditions.forEach((precondition) => {
      if ((precondition.reference == criteria_name ) ||
          (precondition.preconditions && this.criteria_in_precondition(precondition.preconditions, criteria_name))){
            found = true;
          }
    });
    return found;
  }

  /* Calculate the patient level results for the given quality report. This will generate a prefilter for the measure defined in the qualityReport
     then create a FhirPatientSource source based on that prefilter query.  Once the PatientSource has been created the patients will be claculated
     against the measure.  This method must be run in a Fiber context as the fhir-patient-api loads patients in a Future
     @param {qualityReport} qualityReport -- the report to calculate patients for
     */
  calculate(qualityReport) {
    var measure = this.getMeasure(qualityReport);
    var filter =  this.buildPrefilter(measure,qualityReport.effective_date);
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
