
### Monitor
  The qr_monitor.js script will monitor the mongodb query_cache collection for reports that need to be calculated
  and add them the redis calculate queue for processing by the calculation_job described below.  


    -m, --mongo_host  the host of the mongodb server that contains the fhir patient data and where patient values will be stored   [default: "127.0.0.1"]
    -d, --database    the mongodb database                                                                                         [default: "fhir"]
    -r, --redis       the redis server used to store the background processing jobs                                                [default: "127.0.0.1"]


### Calculation Worker
  The calculation_job.js script is used to perform the measure calculations.  The script itself is an implementation of a node-resque worker and performs jobs that are added to
  redis queues.  For this task there are 2 redis queues that are used, calculate and rollup.  

  The qr_monitor adds the quality reports to be calculated to this queue based on the reports id.  The calculate worker then pulls these jobs from redis, looks up the quality report and then calculates the measure that is defined in the report based on the effective_date that is also contained in the report object. The calculation job when executed will calculate the patient level results and place them in mongodb. Once the patient level results are calculated the report is then added to the rollup queue along with any other quality reports that are based on the same measure and effective date to perform the aggregate level calculations.  

  The calculation_job worker also contains a node-resque job for performing the aggregate rollup of the individual patient level calculations.  This is based on the mongodb aggregation
  pipeline and the information contained in the quality report for any filtering of patient level data that needs to take place.  



  calculation_job.js parameters

    -q, --queues      which redis queues to monitor , format is q1:q2:q3                                                           [default: "calculate:rollup"]
    -b, --bundle      path to the bundle to use for measure calculation [file path]                                                [required]
    -m, --mongo_host  the host of the mongodb server that contains the fhir patient data and where patient values will be stored   [default: "127.0.0.1"]
    -d, --database    the mongodb database                                                                                         [default: "fhir"]
    -r, --redis       the redis server used to store the background processing jobs                                                [default: "127.0.0.1"]



### Multiple Workers
  A single calculation_job worker can monitor both the the calculate and rollup queues and perform both calculation tasks. This will become a bottle neck however as all calculation will be dependent on a single worker.  In order to perform multiple calculations in parallel multiple calculation_jobs need to be run simultaneously.  This can be accomplished using the index.js script which will spawn a number of calculation jobs each targeted at  performing either patient level calculations or rollup calculations.

  index.js parameters  

    -c, --cp          number of patient calculation processors                                                                     [default: 10]
    -a, --ap          number of aggregation processors                                                                             [default: 4]
    -b, --bundle      path to the bundle to use for measure calculation [file path]                                                [required]
    -m, --mongo_host  the host of the mongodb server that contains the fhir patient data and where patient values will be stored   [default: "127.0.0.1"]
    -d, --database    the mongodb database                                                                                         [default: "fhir"]
    -r, --redis       the redis server used to store the background processing jobs                                                   [default: "127.0.0.1"]
