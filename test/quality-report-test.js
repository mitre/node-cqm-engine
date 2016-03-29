"use strict";
let QualityReport = require("../lib/quality_report")
let MeasureAggregator = require("../lib/measure_aggregator")
let mongoose = require("mongoose");
mongoose.connect('mongodb://127.0.0.1:27017/fhir-test');
describe('QualityReport', function() {
  this.timeout(0);

  it("should be able to create a new qualityReport", (done) => {
    let qr = new QualityReport();
    qr.save().then((res) =>{
      done();
    })
    });

  it("should be able to read qualityReports from db  ", (done) => {
    QualityReport.find().then((res) =>{
      //console.log(res);
      done();
    })
    });

});
