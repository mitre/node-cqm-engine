"use strict";
module.exports = class PatientResultHandler {

  constructor(db, collection){
    this.db = db;
    this.collection = collection || "patient_cache"
  }

  start(){
  }

  handleResult(result){
    let collection = this.db.collection(this.collection);
    collection.insertOne({value: result});
  }

  finished(){
  }

}
