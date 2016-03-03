var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var qualityReportSchema = new Schema({
  measure_id: String,
  sub_id: String,
  effective_date: Number,
  filters: Schema.Types.Mixed,
  status: {
    state: String,
    log: [String]
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  result: {
    IPP: Number,
    DENOM: Number,
    DENEX: Number,
    DENEXCEP: Number,
    NUMER: Number,
    NUMEREXCEP: Number,
    MSRPOPL: Number,
    OBSERV: Number,
    antinumerator: Number,
    considered: Number,
    population_ids: Schema.Types.Mixed,
    supplemnetal_data: Schema.Types.Mixed
  }
},{collection: "query_cache"});

qualityReportSchema.pre('update', function() {
  this.update({}, {
    $set: {
      updated_at: new Date()
    }
  });
});

qualityReportSchema.statics.findOrCreate = function(measure_id, sub_id, parameters, cb) {
  var queryParams = {
    measure_id: measure_id,
    sub_id: sub_id
  };
  for (var p in Object.keys(parameters)) {
    if (!["status", "result", "created_at", "updated_at"].index(p)) {
      queryParams[p] = parameters[p];
    }
  }
  var callback = cb;
  var returnOrCreate = (object) => {
    if (object) {
      callback(object);
    } else {
      this.create(queryParams, (err, qr) => {
        if (err) {
          throw err;
        } else {
          callback(qr);
        }
      })
    }

  }
  return this.find(queryParams, returnOrCreate);
}

// find all of the relavent reports and set their status to queued
qualityReportSchema.statics.markForRollup = function(qr){
  return this.find({
    measure_id: qr.measure_id,
    sub_id: qr.sub_id,
    effective_date: qr.effective_date,
    "status.state": {
      "$ne": "calculated"
    }
  }).then((results) => {
    results.forEach((rep) => {
      rep.status.state = "queued";
      rep.save();
    })
    return results;
  });
}


qualityReportSchema.methods.markFailed = function(error){
  this.status.state = "failed"
  this.status.log.push(error);
  this.save();
}

qualityReportSchema.methods.setResultsAndMarkCompleted = function(res){
  this.status.state = "completed"
  this.result = res;
  this.save();
}
// count all of the reports with the same measure_id,sub_id,effective_date that
//are either completed, calculating, or queued
qualityReportSchema.statics.queuedRunningOrDone= function(qr) {
  return this.where({
    measure_id: this.measure_id,
    sub_id: this.sub_id,
    effective_date: this.effective_date,
    status : {state: {
      "$in": ["calculating", "queued", "completed"]
    }}
  }).count();
}



var QualityReport = mongoose.model("QualityReport", qualityReportSchema);

module.exports = QualityReport;
