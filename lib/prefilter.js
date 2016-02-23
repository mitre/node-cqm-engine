"use strict";
module.exports.Prefilter = class Prefilter {
  constructor(fields) {

    this.record_field = fields['record_field'];
    this.comparison = fields['comparison'] || "$eq";
    this.effective_time_based = fields['effective_time_based'] || false;
    this.desired_value = fields['desired_value'] ;
    this.effective_time_compare = fields['effective_time_compare'] || "SBS";
    this.effective_time_offset = fields['effective_time_offset'];
    this.effective_time_quantity = fields['effective_time_quantity'];
  }

  buildQueryHash(effective_time) {
    let filter_value = null;
    if (this.effective_time_based) {
      // create a new date object and set the unit to whatever it currently is
      // minus the offset
      // assumes that we are sending in the effective time that the measures currently use
      let et = new Date(effective_time * 1000)
      if (this.effective_time_compare) {
        // set back to the begining of the year as effective_time is the end of the year
        et.setFullYear(et.getFullYear() - 1);
      }

      switch (this.effective_time_quantity) {
      case 'mo':
        et.setMonth(et.getMonth() - this.effective_time_offset)
        break;
      case 'd':
        et.setDate(d.getDate() - this.effective_time_offset)
        break;
      case 'day':
        et.setDate(d.getDate() - this.effective_time_offset)
        break;
      case 'wk':
        et.setDate(d.getDate() - (7 * this.effective_time_offset))
        break;
      default:
        et.setFullYear(et.getFullYear() - this.effective_time_offset);
      }
      filter_value = et.getTime()/1000;
    } else {
      filter_value = this.desired_value;
    }
    let ret = {}
    if (this.comparison == "$eq") {
      ret[this.record_field] = filter_value;
    } else {
      let comp = {};
      comp[this.comparison] = filter_value;
      ret[this.record_field] = comp;
    }
    return ret;
  }
}

module.exports.AggregatePrefilter = class AggregatePrefilter {
  constructor(aggregate) {
    this.aggregate = aggregate;
    this.filters = []
  }

  addFilter(filter) {
    if (filter) {
      this.filters.push();
    }
  }

  buildQueryHash(effective_time) {
    let prefs = []
    this.filters.forEach((filter) => {
      prefs.push(filter.buildQueryHash(effective_time))
    });
    prefs = prefs.filter((n) => {
      return n != undefined
    });
    let ret = {};
    ret[("$" + this.aggregate)] = prefs;
    return prefs.length == 0 ? null : ret
  }
}
