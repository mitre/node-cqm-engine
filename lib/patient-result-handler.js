class PatientResultHandler {

  constructor(db, collection){
    this.db = db;
    this.collection = collection || "patient-cache"
  }

  start(){
  }

  handleResult(result){
    let collection = this.db.collection(this.collection);
    collection.insertOne(result);
  }

  finished(){
  }
  
}
