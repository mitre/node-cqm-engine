"use strict";
let MeasureCalculationHandler = require("./measure-calculation-handler")
module.exports = class CQMCalculationHandler {

  constructor(measures, metaData, db){
    this.db = db;
    this.batch = [];
    this.metaData = metaData || {};
    this.measures = measures;
    this.measureHandlers = {};

    Object.keys(this.measures).forEach(mkey =>{
      let measure = this.measures[mkey];
      let mid = measure.id
      if(measure.sub_id) {mid = mid+measure.sub_id}
      this.measureHandlers[mid] = new MeasureCalculationHandler(measure,metaData);
    });
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
      let collection = this.db.collection("patient-cache");
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
      let collection = this.db.collection("quality-reports");
      collection.insertOne(result);
    } catch(e){
      console.log(e);
    }
    });
  }

}
