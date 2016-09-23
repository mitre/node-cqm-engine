"use strict";
let MeasureCalculationHandler = require("node-qme").MeasureCalculationHandler
module.exports = class CQMCalculationHandler {

  constructor(measure_source, metaData, db){
    this.db = db;
    this.batch = [];
    this.metaData = metaData || {};
    this.measure_source = measure_source;
    this.measureHandlers = {};
  }

  start(){
      let keys = Object.keys(this.measureHandlers);
      keys.forEach(key =>{
        let mh = this.measureHandlers[key];
        mh.start();
      });
  }


  getHandler(hqmf_id, sub_id){
    let mid = hqmf_id;
    if(sub_id){mid=mid+sub_id}
    this.measureHandlers[mid] = this.measureHandlers[mid] || new MeasureCalculationHandler(this.measure_source.getMeasure(hqmf_id,sub_id),this.metaData);
    return this.measureHandlers[mid];
  }

  handleResult(result){
    let mhandler = this.getHandler(result.measure_id, result.sub_id);

    if(mhandler){
      mhandler.handleResult(result);
      this.batch.push(result);
      if(this.batch.length > 100){
        this.insertBatch();
      }
    }
  }

  insertBatch(){
    if(this.batch.length > 0){
      let collection = this.db.collection("patient_cache");
      collection.insert(this.batch);
      this.batch = [];
    }
  }

  finished(){
    this.insertBatch();
    let keys = Object.keys(this.measureHandlers);
    keys.forEach(key =>{
      try{
      let mh = this.measureHandlers[key];
      let result = mh.finished();
      let collection = this.db.collection("query_cache");
      collection.insertOne(result);
    } catch(e){
      console.log(e);
    }
    });
  }

}
