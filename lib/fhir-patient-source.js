"use strict";
let Patient = require("fhir-patient-api/lib/patient-extensions").Patient
let Future = require("fibers/future")
module.exports = class FhirPatientSource {

  constructor(db, collection, query){
    this.db = db;
    this.collection = collection ? collection : "patients";
    this.query = query ? query : {};
  }

  count(){
    let future = new Future();
    this.getCursor().count(future.resolver());
    return future.wait();
  }

  reset(){
    if(this.cursor){
      this.cursor.close();
      this.cursor = null;
    }
  }

  getCursor(){
    if(!this.cursor){
      var collection = this.db.collection(this.collection);
      this.cursor = collection.find(this.query,{"_id" : true});
    }
    return this.cursor;
  }

  next(){
    var cursor = this.getCursor();
    var patient_id = null;
    if(!cursor){ return null};
    let future = new Future();
    cursor.nextObject(future.resolver());
    var object = future.wait();
    if(object){
      patient_id = object["_id"]

    }
    return patient_id ? new Patient(this.db,patient_id) : null;
  }


}
