"use strict";
let Patient = require("fhir-patient-api/lib/patient-extensions").Patient
let Future = require("fibers/future")
/* PatientSource class that loads Fhir based pateitn records from mongodb
*/
module.exports = class FhirPatientSource {

  /* @param {MongogClient} db -- database connection to mongodb
     @param {String} collection -- the collection that hte fhir patients are stored in
     @param {Object} query -- mongodb query filter for selecting patient records
     */
  constructor(db, collection, query){
    this.db = db;
    this.collection = collection ? collection : "patients";
    this.query = query ? query : {};
  }

  /*
   @return {number} returns a count of the number of records the patient source has (based on query filter passed in constructor)
   */
  count(){
    let future = new Future();
    this.getCursor().count(future.resolver());
    return future.wait();
  }

  /*
    Resets the patient source to the begining
    */
  reset(){
    if(this.cursor){
      this.cursor.close();
      this.cursor = null;
    }
  }

  /* Get the mongodb cursor to the patient records to iterate over
  */
  getCursor(){
    if(!this.cursor){
      var collection = this.db.collection(this.collection);
      this.cursor = collection.find(this.query,{"_id" : true});
    }
    return this.cursor;
  }

  /* Get the next patient record or null if there are none left
  @return {Patient} a fhir-patient-api patient record 
  */
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
