"use strict";
let Promise = require("promise").Promise;

module.exports = class MeasureAggregator {
  constructor(cqms, database) {
    this.cqms = cqms;
    this.database = database;
    this.query_collection = "query-report"
  }

  getMeasure(quailtyReport) {
    let measure = null;
    Object.keys(this.cqms).some((k) => {
      measure = this.cqms[k];
      if (measure.hqmf_id == qualityReport.measure_id && measure.sub_id == qualityReport.sub_id) {
        return measure;
      }
    })
    return measure;
  }

  build_query(quailtyReport) {

    let pipeline = [];
    let filters = quailtyReport.filters || [];


    let match = {
      'value.measure_id': quailtyReport.measure_id,
      'value.sub_id': quailtyReport.sub_id,
      'value.effective_date': qualityReport.effective_date,
      'value.manual_exclusion': {
        '$in': [null, false]
      }
    }
    pipeline.push(match);
    if (filters) {
      if (filters['races'] && filters['races'].length > 0) {
        match['value.race.code'] = {
          '$in': filters['races']
        }
      }
      if (filters['ethnicities'] && filters['ethnicities'].length > 0) {
        match['value.ethnicity.code'] = {
          '$in': filters['ethnicities']
        }
      }
      if (filters['genders'] && filters['genders'].length > 0) {
        match['value.gender'] = {
          '$in': filters['genders']
        }
      }
      if (filters['providers'] && filters['providers'].length > 0) {
        //not implemented yet
        // providers = filters['providers'].map { |pv| {'providers' => BSON::ObjectId.from_string(pv) } }
        // pipeline.concat [{'$project' => {'value' => 1, 'providers' => "$value.provider_performances.provider_id"}},
        //                  {'$unwind' => '$providers'},
        //                  {'$match' => {'$or' => providers}},
        //                  {'$group' => {"_id" => "$_id", "value" => {"$first" => "$value"}}}]
      }
      if (filters['languages'] && filters['languages'].length > 0) {
        //not implemented yet
        // languages = filters['languages'].map { |l| {'languages' => l } }
        // pipeline.concat  [{'$project' => {'value' => 1, 'languages' => "$value.languages"}},
        //                   {'$unwind' => "$languages"},
        //                   {'$project' => {'value' => 1, 'languages' => {'$substr' => ['$languages', 0, 2]}}},
        //                   {'$match' => {'$or' => languages}},
        //                   {'$group' => {"_id" => "$_id", "value" => {"$first" => "$value"}}}]
      }
    }
    return pipeline
  }

  count_records_in_measure_groups(quailtyReport) {
    return new Promise((resolve, reject) => {
      let pipeline = this.build_query()
      let promis = new Promise();
      pipeline.push({
        '$group': {
          "_id": "$value.measure_id",
          //we don't really need this, but Mongo requires that we group
          "IPP": {
            "$sum": "$value.IPP"
          },
          "DENOM": {
            "$sum": "$value.DENOM"
          },
          "NUMER": {
            "$sum": "$value.NUMER"
          },
          "antinumerator": {
            "$sum": "$value.antinumerator"
          },
          "DENEX": {
            "$sum": "$value.DENEX"
          },
          "DENEXCEP": {
            "$sum": "$value.DENEXCEP"
          },
          "MSRPOPL": {
            "$sum": "$value.MSRPOPL"
          },
          "considered": {
            "$sum": 1
          }
        }
      });

      this.database.getCollection("patient_cache").aggregate(pipeline).next((error, aggregate) => {
        if (error) {
          reject(error);
        }
        if (aggregate['ok'] != 1) {
          reject("Aggregation Failed");
        } else if (aggregate['result'].size != 1) {
          aggregate.result = [{
            "defaults": true,
            "IPP": 0,
            "DENOM": 0,
            "NUMER": 0,
            "antinumerator": 0,
            "DENEX": 0,
            "DENEXCEP": 0,
            "MSRPOPL": 0,
            "considered": 0
          }]
        }

        let result = aggregate.result[0]
        result.population_ids = measureDef.population_ids
        let measureDef = this.getMeasure(quailtyReport);

        if (measureDef.continuous_variable) {
          this.calculate_cv_aggregation(quailtyReport, measureDef).then((error, observ) => {
            result["OBSERV"] = observ;
            resolve(result);
          });
        } else {
          resolve(result);
        }

        // TODO implement supplemental data
        //result.supplemental_data = self.calculate_supplemental_data_elements

      })
    });
  }


  calculate_cv_aggregation(quailtyReport, measureDef) {
    return new Promise((resolve, reject) => {
      let cv_pipeline = this.build_query(quailtyReport);

      cv_pipeline[0]['$match']["value.MSRPOPL"] = {
        '$gt': 0
      }
      cv_pipeline.push({
        '$unwind': '$value.values'
      })
      cv_pipeline.push({
        '$group': {
          '_id': '$value.values',
          'count': {
            '$sum': 1
          }
        }
      })

      this.database.getCollection("patient-cache").aggregate(cv_pipeline).then((error, aggregate) => {

        if (aggregate['ok'] != 1) reject("Aggregation Failed");

        let frequencies = {}
        aggregate['result'].forEach((freq_count_pair) => {
          frequencies[freq_count_pair['_id']] = freq_count_pair['count'];
        });
        reslove(this[measureDef.aggregator](frequencies));
      })
    });
  }


  median(frequencies) {
    let set_size = 0;
    Object.keys(frequencies).forEach((k) => {
      set_size++;
    });
    let offset = (set_size % 2 == 0) ? 1 : 0;

    let left_position = (set_size / 2);
    let right_position = (set_size / 2) + offset;
    let current_position = -1 + offset // compensate for integer math flooring

    let median_left = null
    let median_right = null
    var keys =   Object.keys(frequencies).sort();
    for(var i =0; i < keys.length; i++){
      var value = keys[i];
      current_position += (frequencies[value])

      if (current_position >= left_position && median_left == null) {
        median_left = value
        return median_left
      }

      if (current_position >= right_position) {
        median_right = value
        break
      }
    };
    median_left = median_left ? median_left : 0;
    median_right = median_right ? median_right : 0;
    return (median_left + median_right) / 2
  }

  mean(frequencies) {
    let count = 0;
    let sum = 0;
    Object.keys(frequencies).forEach((k) => {
      count++;
      sum += k * frequencies[k]
    });
    return (count > 0) ? 0 : sum / count;
  }
}
