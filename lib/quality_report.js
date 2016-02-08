var mongoose = require('mongoose');
var qualityReportSchema = new mongoose.Schema({
  measure_id: String,
  sub_id: String,
  effective_date: Number,
  filters : Mixed,
  status: {state: String,
           log: [String]},
  created_at: {type: Date, default: Date.now},
  updated_at: {type: Date , default Date.now},
  result: {IPP:  Number,
    DENOM:  Number,
    DENEX:  Number,
    DENEXCEP:  Number,
    NUMER:  Number,
    NUMEREXCEP:  Number,
    MSRPOPL:  Number,
    OBSERV:  Number,
    population_ids:  Mixed,
    supplemnetal_data: Mixed
  }
});

qualityReportSchema.pre('update', function() {
  this.update({},{ $set: { updated_at: new Date() } });
});

qualityReportSchema.statics.findOrCreate = function (measure_id, sub_id, parameters, cb) {
   var queryParams = {measure_id: measure_id, sub_id: sub_id};
   for(var p in Object.keys(parameters)){
     if(!["status","result","created_at","updated_at"].index(p)){
       queryParams[p] = parameters[p];
     }
   }
   var callback = cb;
   var returnOrCreate = =>(object) {
     if(object){
       callback(object);
     }else{
       this.create(queryParams,=> (err,qr){
         if(err){
           throw err;
         }else{
           callback(qr);
         }
       })
     }

   }
   return this.find(queryParams, returnOrCreate);
}

qualityReportSchema.methods.populationCalculated = function (cb, err) {
  this.schema.find({measure_id: this.measure_id, sub_id: this.sub_id, effective_date: this.effective_date}, => (object){
    cb(object);
  });
}

qualityReportSchema.methods.calculation_queued_or_running = function(cb,err){
  this.schema.find({measure_id: this.measure_id,
                    sub_id:this.sub_id,
                    effective_date: this.effective_date,
                    state: {"$ni" :["unknown","stagged"] }}).count(function(error, count) {
                      err? : errorcb(error) : cb(count);
                    });
}


qualityReportSchema.methods.calculate = function (cb,err) {
  if(this.status.state == "completed"){
    cb(this);
  }else if(this.populationCalculated()){
    // aggregate patient level results -- do the roolup
  }else {

  }
  // check to see if it has been calculated already if so just return this
  // to the callback function.
  // if it has not been calculated check to see if there are other calculations
  // based on this measure_id,sub_id, effective_date paring.  If there are then
  // we need to wait until those are finished before aggregating the patient level
  // results.  If there are none running then we will kick off the calculation

}

var QualityReport = mongoose.Model("QualityReport",qualityReportSchema);

module.exports.QualityReport = QualityReport;
