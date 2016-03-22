"use strict";
let pref = require("../lib/prefilter")
let assert = require('assert');
let jsonIsEqual = require("json-is-equal")
describe('Prefilter', function () {
  this.timeout(0);

  it("should return null for empty aggregate prefilter", (done) => {
    let pre = new pref.AggregatePrefilter("and");
    assert.equal(null, pre.buildQueryHash(0));
    done();
  });

  it("should return null for aggregate prefilter that contains other empty aggregate prefilters", (done) => {
    let pre = new pref.AggregatePrefilter("and");
    pre.addFilter(new pref.AggregatePrefilter("and"));
    assert.equal(null, pre.buildQueryHash(0));
    done();
  });

  it("should be able to correctly create a simple query filter" , (done) =>{
    let filter = new pref.Prefilter({record_field: "gender", desired_value: "female"});
    let mongoFilter = filter.buildQueryHash(0);
    assert(jsonIsEqual(mongoFilter,{"gender" : "female"}))
    done();
  });

  it("should be able to correctly create a non $eq query filter" , (done) =>{
    let filter = new pref.Prefilter({record_field: "birthdate", comparison: "$gt", desired_value: 12});
    let mongoFilter = filter.buildQueryHash(0);
    assert(jsonIsEqual(mongoFilter,{"birthdate" : {"$gt" : 12}}))
    done();
  });

  it("should be able to correctly create an effective time base query without a unit " , (done) =>{
    let filter = new pref.Prefilter({record_field: "birthdate", comparison: "$gt", effective_time_based: true});
    filter.effective_time_offset = 1;
    let mongoFilter = filter.buildQueryHash(1420070399);
    let d = new Date(1420070399000);
    d.setFullYear(d.getFullYear() -2);
    assert(jsonIsEqual(mongoFilter,{"birthdate" : {"$gt" : d.getTime()/1000}}))
    done();
  });

  it("should be able to correctly create an effective time base query with a mo unit " , (done) =>{
    let filter = new pref.Prefilter({record_field: "birthdate", comparison: "$gt", effective_time_based: true, effective_time_quantity: "mo" });
    filter.effective_time_offset = 2;
    let mongoFilter = filter.buildQueryHash(1420070399);
    let d = new Date(1420070399000);
    // effective date is end of year so for sbs it will need to be set to the begining of the year
    // before the months are taken off
    d.setFullYear(d.getFullYear() - 1);
    d.setMonth(d.getMonth() - 2);
    assert(jsonIsEqual(mongoFilter,{"birthdate" : {"$gt" : d.getTime()/1000}}))
    done();
  });



});
