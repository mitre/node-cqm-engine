"use strict";
/* Simple handler that will store patient level calculation results in mongodb
*/
module.exports = class PatientResultHandler {
  /*
   @param {MongoClient} db -- conenction to mongodb
   @param {string} collection -- the collection to store the results in (defaults to patient_cache)
   */
  constructor(db, collection){
    this.db = db;
    this.collection = collection || "patient_cache"
  }
  /* NO-OP */
  start(){
  }
  /*
   Simply push the result in the configured mongodb database collection
   */
  handleResult(result){
    let collection = this.db.collection(this.collection);
    collection.insertOne({value: result});
  }
  /* NO-OP */
  finished(){
  }

}
