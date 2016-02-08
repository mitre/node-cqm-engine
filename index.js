"use strict" ;

let child_process = require("child_process")

for(var i=0; i<10; i++){
  child_process.fork("./calculation_job.js")
}
